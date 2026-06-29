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

// 3) ЗВУК ПРИРОДЫ через Web Audio напрямую (обход сломанного веб-аудио Godot).
//    В этой сборке движок Godot НЕ выдаёт звук в браузер (проверено: его микс молчит,
//    хотя проигрывание идёт). При этом сам Web Audio в браузере рабочий. Поэтому
//    атмосферу (птицы + костёр) проигрываем сами: декодируем mp3 на том же AudioContext
//    и зацикленно играем на первое касание. Гарантированный звук на телефоне.
(function () {
	var Ctor = window.AudioContext || window.webkitAudioContext;
	if (!Ctor) return;
	var started = false;
	window.__ambient = [];
	window.__ambientGain = null;

	function getCtx() {
		if (window.__acs && window.__acs[0]) return window.__acs[0];
		var c = new Ctor();
		window.__acs.push(c);
		return c;
	}

	function playLoop(ctx, url, gain, master) {
		fetch(url).then(function (r) { return r.arrayBuffer(); })
			.then(function (data) { return ctx.decodeAudioData(data); })
			.then(function (buffer) {
				var src = ctx.createBufferSource();
				src.buffer = buffer;
				src.loop = true;
				var g = ctx.createGain();
				g.gain.value = gain;
				src.connect(g);
				g.connect(master);
				src.start(0);
				window.__ambient.push(src);
			})
			.catch(function (e) { console.error('[ambient] ' + url, e); });
	}

	function startAmbient() {
		if (started) return;
		started = true;
		var ctx = getCtx();
		if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
		// Общий выход атмосферы + анализатор для самопроверки уровня.
		var master = ctx.createGain();
		master.gain.value = 1.0;
		var an = ctx.createAnalyser();
		an.fftSize = 256;
		master.connect(an);
		an.connect(ctx.destination);
		window.__ambientGain = master;
		window.__ambientLevel = function () {
			var buf = new Uint8Array(an.fftSize);
			an.getByteTimeDomainData(buf);
			var s = 0;
			for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; s += v * v; }
			return Math.sqrt(s / buf.length);
		};
		playLoop(ctx, 'birds.mp3', 0.5, master);
		playLoop(ctx, 'bonfire.mp3', 0.8, master);
	}

	['touchend', 'pointerdown', 'mousedown', 'click', 'keydown'].forEach(function (e) {
		window.addEventListener(e, startAmbient, { capture: true, passive: true });
	});
})();
