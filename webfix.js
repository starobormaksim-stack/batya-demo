// Веб-фиксы для мобильных (iOS Safari) — выполняется ДО движка Godot.

// 1) Снять ранее зарегистрированные service worker'ы (старый coi-serviceworker мог отдавать
//    закэшированную версию вернувшимся игрокам — из-за этого обновления «не доходили»).
if ('serviceWorker' in navigator) {
	navigator.serviceWorker.getRegistrations()
		.then(function (rs) { rs.forEach(function (r) { r.unregister(); }); })
		.catch(function () {});
}

// 2) Разблокировка звука: браузеры (особенно iOS Safari) держат AudioContext «suspended»
//    до реального касания. Перехватываем все создаваемые AudioContext и возобновляем их
//    на КАЖДОЕ касание/клик/клавишу — Godot на iOS не всегда делает это сам.
(function () {
	var ACs = [], Orig = window.AudioContext || window.webkitAudioContext;
	if (Orig) {
		function P() { var c = new Orig(...arguments); ACs.push(c); return c; }
		P.prototype = Orig.prototype;
		window.AudioContext = P;
		window.webkitAudioContext = P;
	}
	window.__acs = ACs;
	function resume() {
		for (var i = 0; i < ACs.length; i++) {
			try { if (ACs[i].state !== 'running') ACs[i].resume(); } catch (e) {}
		}
	}
	['touchstart', 'touchend', 'pointerdown', 'mousedown', 'keydown', 'click'].forEach(function (e) {
		window.addEventListener(e, resume, { capture: true, passive: true });
	});
})();
