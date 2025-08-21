document.getElementById("createRoom").addEventListener("click", async () => {
    const name = document.getElementById("nameInput").value || "SinNombre";
    const res = await fetch("/api/create-room");
    const data = await res.json();
    const roomId = data.roomId;
    window.location.href = `/room/${roomId}?name=${encodeURIComponent(name)}`;
});

document.getElementById("joinRoom").addEventListener("click", () => {
    const name = document.getElementById("nameInput").value || "SinNombre";
    const roomId = document.getElementById("joinRoomInput").value.trim().toUpperCase();
    if (!roomId) {
        alert("Por favor, ingresa un ID de sala válido.");
        return;
    }
    window.location.href = `/room/${roomId}?name=${encodeURIComponent(name)}`;
});