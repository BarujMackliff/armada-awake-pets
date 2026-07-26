"use strict";

let poses = {
  alert: "../assets/crixus-alert.png",
  working: "../assets/crixus-working.png",
  walking: "../assets/crixus-walking.png",
  thinking: "../assets/crixus-thinking.png",
  success: "../assets/crixus-success.png",
  "error-log": "../assets/crixus-error-log.png",
  checkpoint: "../assets/crixus-checkpoint.png",
  waiting: "../assets/crixus-waiting.png",
  "battle-ready": "../assets/crixus-battle-ready.png",
  routing: "../assets/crixus-routing.png",
  blocked: "../assets/crixus-blocked.png",
  "off-duty": "../assets/crixus-off-duty.png"
};
let character = {
  name: "CRIXUS",
  displayName: "CRIXUS Awake Pet",
  emptyStatus: "Waiting for an Anti-Gravity session",
  missionSingular: "mission",
  missionPlural: "missions"
};

const avatar = document.querySelector("#avatar");
const pet = document.querySelector("#pet");
const chevron = document.querySelector("#chevron");
const missionCard = document.querySelector("#mission-card");
const title = document.querySelector("#mission-title");
const status = document.querySelector("#mission-status");
const count = document.querySelector("#session-count");
const panel = document.querySelector("#session-panel");
const avatarDrag = document.querySelector("#avatar-drag");

let sessions = [];
let expanded = false;
let currentPose = "";
let forcedUntil = 0;
let forcedTimer;
let dragging = false;
let collapseTimer;

function setPose(name) {
  if (!poses[name] || name === currentPose) return;
  currentPose = name;
  avatar.classList.add("swap");
  setTimeout(() => {
    avatar.src = poses[name];
    avatar.classList.remove("swap");
  }, 75);
}

function automaticPose() {
  if (Date.now() < forcedUntil || dragging) return;
  if (!sessions.length) return setPose("waiting");
  if (sessions.length > 1) return setPose("battle-ready");
  if (sessions[0].state === "working") return setPose("working");
  if (sessions[0].state === "recent") return setPose("alert");
  setPose("thinking");
}

function forcePose({ name, duration }) {
  clearTimeout(forcedTimer);
  forcedUntil = Date.now() + Number(duration || 5000);
  setPose(name);
  forcedTimer = setTimeout(() => {
    forcedUntil = 0;
    automaticPose();
  }, Number(duration || 5000));
}

function renderPanel() {
  panel.replaceChildren();
  for (const session of sessions) {
    const row = document.createElement("button");
    row.className = "session-row";
    row.type = "button";
    row.innerHTML = `
      <span class="state-dot ${session.state}"></span>
      <span class="row-copy">
        <span class="row-title"></span>
        <span class="row-summary"></span>
      </span>
    `;
    row.querySelector(".row-title").textContent = session.title;
    row.querySelector(".row-summary").textContent = `${session.status} · ${session.summary}`;
    row.addEventListener("click", () => {
      forcePose({ name: "routing", duration: 1800 });
      window.crixus.openSession(session.id);
    });
    panel.append(row);
  }
}

function renderSessions(nextSessions) {
  sessions = Array.isArray(nextSessions) ? nextSessions : [];
  count.hidden = sessions.length < 2;
  count.textContent = sessions.length;
  if (!sessions.length) {
    title.textContent = character.displayName;
    status.textContent = character.emptyStatus;
  } else if (sessions.length === 1) {
    title.textContent = sessions[0].title;
    status.textContent = `${sessions[0].status} · ${sessions[0].summary}`;
  } else {
    title.textContent = `${sessions.length} ${character.name} ${character.missionPlural} active`;
    const working = sessions.filter((session) => session.state === "working").length;
    status.textContent = working ? `${working} working now · click to choose` : "Click to choose a mission";
  }
  renderPanel();
  automaticPose();
}

function setExpanded(next) {
  clearTimeout(collapseTimer);
  expanded = Boolean(next && sessions.length > 1);
  panel.hidden = !expanded;
  chevron.classList.toggle("open", expanded);
  window.crixus.setExpanded(expanded);
  if (expanded) collapseTimer = setTimeout(() => setExpanded(false), 15_000);
}

missionCard.addEventListener("click", () => {
  if (sessions.length === 1) {
    forcePose({ name: "routing", duration: 1800 });
    window.crixus.openSession(sessions[0].id);
  } else if (sessions.length > 1) {
    setExpanded(!expanded);
  }
});

chevron.addEventListener("click", () => setExpanded(!expanded));

avatarDrag.addEventListener("mousedown", () => {
  dragging = true;
  window.crixus.setDragging(true);
  setPose("walking");
});
window.addEventListener("mouseup", () => {
  if (!dragging) return;
  dragging = false;
  window.crixus.setDragging(false);
  automaticPose();
});

document.addEventListener("mousemove", (event) => {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  window.crixus.setInteractive(Boolean(element?.closest(".hit-region")));
});

window.crixus.onSessions((next) => {
  const wasMulti = sessions.length > 1;
  renderSessions(next);
  if (wasMulti && sessions.length < 2) setExpanded(false);
});
window.crixus.onPose(forcePose);
window.crixus.onRoam(({ active }) => {
  pet.classList.toggle("roaming", Boolean(active));
});
window.crixus.onCollapse(() => setExpanded(false));
window.crixus.onScannerError(() => {
  status.textContent = "Session scanner retrying…";
  forcePose({ name: "blocked", duration: 2200 });
});

Promise.all([window.crixus.getCharacter(), window.crixus.getSessions()]).then(([pack, activeSessions]) => {
  character = { ...character, ...pack };
  poses = Object.fromEntries(
    Object.entries(pack.assets).map(([state, relative]) => [state, `../${relative.replaceAll("\\", "/")}`])
  );
  avatar.alt = `${character.name} desktop companion`;
  title.textContent = character.displayName;
  avatar.src = poses.alert;
  currentPose = "alert";
  renderSessions(activeSessions);
});
