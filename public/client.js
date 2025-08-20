(() => {
  const socket = io();

  const $ = (sel) => document.querySelector(sel);
  const params = new URLSearchParams(location.search);
  const name = params.get("name") || "SinNombre";
  const roomId = (location.pathname.match(/\/room\/([A-Z0-9]+)/i) || [])[1]?.toUpperCase();

  $("#roomId").textContent = roomId || "—";

  async function verifyRoom() {
    const res = await fetch(`/api/room-exists/${roomId}`);
    const data = await res.json();
    if (!data.exists) {
      alert("La sala no existe o fue eliminada.");
      location.href = "/";
    }
  }

  verifyRoom().then(() => socket.emit("joinRoom", { roomId, name }));

  $("#copyLink").addEventListener("click", async () => {
    const url = location.origin + `/room/${roomId}` + `?name=`;
    try { await navigator.clipboard.writeText(url); alert("Enlace copiado!"); }
    catch { prompt("Copiá este enlace:", url); }
  });

  const btnReady = $("#btnReady");
  btnReady.addEventListener("click", () => {
    const newReady = btnReady.dataset.ready !== "true";
    socket.emit("toggleReady", { roomId, ready: newReady });
    setReadyUI(newReady);
  });

  function setReadyUI(isReady) {
    btnReady.dataset.ready = isReady ? "true" : "false";
    btnReady.textContent = isReady ? "No estoy listo ❌" : "Estoy listo ✅";
  }

  socket.on("roomUpdate", (state) => {
    $("#status").textContent = state.status;
    const list = $("#players");
    list.innerHTML = "";
    state.players.forEach(p => {
      const li = document.createElement("li");
      li.textContent = `${p.name} ${p.ready ? "✅" : "⏳"} ${p.state === "out" ? "(Eliminado)" : ""}`;
      list.appendChild(li);
    });
  });

  socket.on("players", (players) => fillVoteSelect(players));

  socket.on("gameStarted", ({ playerCount }) => {
    console.log("Partida iniciada con", playerCount, "jugadores");
    $("#votingSection").style.display = "block";
    $("#voteBtn").disabled = false;
  });

  socket.on("roleAssigned", ({ role, value }) => {
    const overlay = $("#secretOverlay");
    $("#secretTitle").textContent = role === "Impostor" ? "Sos el IMPOSTOR 🤫" : "Tu identidad secreta";
    $("#secretText").textContent = role === "Impostor"
      ? "No reveles tu identidad. Tu objetivo es confundír a los demás."
      : `Sos: ${value}. No dejes que el impostor te descubra.`;
    overlay.classList.remove("hidden");
  });

  $('#closeSecret').addEventListener('click', () => {
    $('#secretOverlay').classList.add('hidden');
    $("#votingSection").style.display = "block";
  });

  const voteBtn = $("#voteBtn");
  voteBtn.addEventListener("click", () => {
    const voteSelect = $("#voteSelect");
    const targetId = voteSelect.value;
    if (!targetId) return;
    socket.emit("vote", targetId);
    voteBtn.disabled = true;
  });

  function fillVoteSelect(players = {}) {
    const voteSelect = $("#voteSelect");
    voteSelect.innerHTML = "";
    Object.values(players)
      .filter(p => p.state === "alive")
      .forEach(p => {
        const option = document.createElement("option");
        option.value = p.id;
        option.textContent = p.name;
        voteSelect.appendChild(option);
      });
    voteBtn.disabled = false;
  }

  socket.on("playerEliminated", ({ id, name, isImpostor, message }) => {
    $("#votingSection").style.display = "none";
    $("#voteSelect").innerHTML = "";
    voteBtn.disabled = true;

    if (message) {
      showPopup("Resultado", message);
      return;
    }

    if (socket.id === id) {
      showPopup("Fuiste expulsado", "Has sido expulsado del juego.");
    } else {
      showPopup("Resultado de votación", isImpostor ? "El impostor fue expulsado!" : "El impostor sigue entre nosotros!");
    }
  });

  // --- LÓGICA DE FIN DE RONDA MEJORADA ---
  socket.on("roundEnded", ({ winner, reason }) => {
    let msg = "";
    if (winner === "players") msg = "¡El impostor fue expulsado! Presiona para una nueva ronda.";
    else if (winner === "impostor") msg = "¡El impostor gana! Presiona para una nueva ronda.";

    // Mostramos el popup y al cerrarlo, el jugador se pone "listo"
    showPopup("Ronda finalizada", msg, () => {
      socket.emit("toggleReady", { roomId, ready: true });
      setReadyUI(true);
    });

    // Reset UI
    $("#votingSection").style.display = "none";
    $("#voteSelect").innerHTML = "";
    voteBtn.disabled = true;
  });

  function showPopup(title, message, onButtonClick = () => {}) {
    const overlay = $("#popup");
    $("#popupTitle").textContent = title;
    $("#popupMessage").textContent = message;

    overlay.classList.remove("hidden");
    overlay.classList.add("show");

    const btn = $("#popupBtn");
    btn.onclick = () => {
      overlay.classList.remove("show");
      overlay.classList.add("hidden");
      onButtonClick(); // Ejecuta el callback
    };
  }

})();