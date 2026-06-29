// Веб-фиксы для мобильных (iOS Safari) — выполняется ДО движка Godot.

// 0) КРИТИЧНО для тача: без touch-action:none мобильный браузер перехватывает касания
//    (скролл/зум) и НЕ передаёт их игре — на телефоне ничего не нажимается. Снимаем это.
(function () {
	var st = document.createElement('style');
	st.textContent =
		'html,body{margin:0;padding:0;overflow:hidden;overscroll-behavior:none;' +
		'touch-action:none;-webkit-user-select:none;user-select:none;}' +
		'canvas,#canvas{touch-action:none !important;-webkit-user-select:none;user-select:none;' +
		'-webkit-touch-callout:none;outline:none;}';
	(document.head || document.documentElement).appendChild(st);
})();

// 1) Снять ранее зарегистрированные service worker'ы (старый coi-serviceworker мог отдавать
//    закэшированную версию вернувшимся игрокам — из-за этого обновления «не доходили»).
if ('serviceWorker' in navigator) {
	navigator.serviceWorker.getRegistrations()
		.then(function (rs) { rs.forEach(function (r) { r.unregister(); }); })
		.catch(function () {});
}

// 2) Разблокировка звука: браузеры (особенно iOS Safari) держат AudioContext «suspended»
//    до реального касания. Перехватываем все создаваемые AudioContext и на КАЖДОЕ касание:
//    (а) resume(); (б) проигрываем КОРОТКИЙ ТИХИЙ БУФЕР через контекст — на iOS без этого
//    «кика» звук остаётся выключенным даже после resume(). Godot на iOS сам это не делает.
//    ВАЖНО: если звук всё равно молчит на iPhone — проверь физический переключатель
//    «без звука» (тихий режим) сбоку телефона: он глушит веб-аудио в Safari.
(function () {
	var ACs = [], kicked = [], Orig = window.AudioContext || window.webkitAudioContext;
	if (Orig) {
		function P() { var c = new Orig(...arguments); ACs.push(c); return c; }
		P.prototype = Orig.prototype;
		window.AudioContext = P;
		window.webkitAudioContext = P;
	}
	window.__acs = ACs;
	window.__audioKicked = false;
	function kickOne(c) {
		try { if (c.state !== 'running') c.resume(); } catch (e) {}
		if (kicked.indexOf(c) !== -1) return;
		try {
			var b = c.createBuffer(1, 1, c.sampleRate || 22050);
			var s = c.createBufferSource();
			s.buffer = b;
			s.connect(c.destination);
			if (s.start) { s.start(0); } else if (s.noteOn) { s.noteOn(0); }
			kicked.push(c);
			window.__audioKicked = true;
		} catch (e) {}
	}
	function unlock() {
		for (var i = 0; i < ACs.length; i++) { kickOne(ACs[i]); }
	}
	['touchstart', 'touchend', 'pointerdown', 'mousedown', 'keydown', 'click'].forEach(function (e) {
		window.addEventListener(e, unlock, { capture: true, passive: true });
	});
})();
