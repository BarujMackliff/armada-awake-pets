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
let motionTimer;
let activityTimer;
let dragLastX = 0;
let batteryPaused = false;

const motionClasses = [
  "motion-jump", "motion-sword", "motion-scratch", "motion-sit",
  "motion-patrol-left", "motion-patrol-right", "motion-look",
  "motion-shield", "motion-sleep"
];
const motionDefinitions = {
  jump: { pose: "success", className: "motion-jump", duration: 1900 },
  sword: { pose: "battle-ready", className: "motion-sword", duration: 2300 },
  scratch: { pose: "thinking", className: "motion-scratch", duration: 3000 },
  sit: { pose: "thinking", className: "motion-sit", duration: 3600 },
  "patrol-left": { pose: "walking", className: "motion-patrol-left", duration: 2600 },
  "patrol-right": { pose: "walking", className: "motion-patrol-right", duration: 2600 },
  look: { pose: "alert", className: "motion-look", duration: 2400 },
  shield: { pose: "blocked", className: "motion-shield", duration: 2300 },
  sleep: { pose: "off-duty", className: "motion-sleep", duration: 4200 }
};

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

function clearMotionClasses() {
  pet.classList.remove(...motionClasses);
}

function scheduleActivity(delay) {
  clearTimeout(activityTimer);
  if (batteryPaused) return;
  const wait = delay ?? Math.round(18_000 + Math.random() * 24_000);
  activityTimer = setTimeout(() => {
    if (dragging || expanded || Date.now() < forcedUntil) {
      scheduleActivity(8000);
      return;
    }
    runMotion({ name: "random" });
  }, wait);
}

function runMotion({ name = "random", duration } = {}) {
  if (batteryPaused) return;
  clearTimeout(motionTimer);
  clearMotionClasses();
  const names = Object.keys(motionDefinitions);
  const chosen = name === "random" ? names[Math.floor(Math.random() * names.length)] : name;
  const motion = motionDefinitions[chosen] || motionDefinitions.look;
  const actualDuration = Number(duration) || motion.duration;
  forcedUntil = Date.now() + actualDuration;
  setPose(motion.pose);
  pet.classList.add(motion.className);
  motionTimer = setTimeout(() => {
    clearMotionClasses();
    forcedUntil = 0;
    automaticPose();
    scheduleActivity();
  }, actualDuration);
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

avatarDrag.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  dragging = true;
  dragLastX = event.screenX;
  avatarDrag.setPointerCapture(event.pointerId);
  avatarDrag.classList.add("dragging");
  clearMotionClasses();
  window.crixus.startDrag({ screenX: event.screenX, screenY: event.screenY });
  setPose("walking");
});

avatarDrag.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const deltaX = event.screenX - dragLastX;
  if (deltaX < -1) {
    avatarDrag.classList.add("facing-left");
    avatarDrag.classList.remove("facing-right");
  } else if (deltaX > 1) {
    avatarDrag.classList.add("facing-right");
    avatarDrag.classList.remove("facing-left");
  }
  dragLastX = event.screenX;
  window.crixus.moveDrag({ screenX: event.screenX, screenY: event.screenY });
});

function finishDrag(event) {
  if (!dragging) return;
  dragging = false;
  avatarDrag.classList.remove("dragging");
  if (event?.pointerId && avatarDrag.hasPointerCapture(event.pointerId)) {
    avatarDrag.releasePointerCapture(event.pointerId);
  }
  window.crixus.endDrag();
  automaticPose();
  scheduleActivity(12_000);
}

avatarDrag.addEventListener("pointerup", finishDrag);
avatarDrag.addEventListener("pointercancel", finishDrag);

document.addEventListener("mousemove", (event) => {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  let region = "none";
  if (element?.closest("#avatar-drag")) region = "avatar";
  else if (element?.closest("#session-panel")) region = "panel";
  else if (element?.closest("#mission-card")) region = "card";
  else if (element?.closest("#chevron")) region = "chevron";
  window.crixus.setInteractive({ interactive: region !== "none", region });
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
window.crixus.onMotion(runMotion);
window.crixus.onGhost(({ active }) => pet.classList.toggle("ghosted", Boolean(active)));
window.crixus.onPowerState(({ paused }) => {
  batteryPaused = Boolean(paused);
  pet.classList.toggle("energy-paused", batteryPaused);
  if (batteryPaused) {
    clearTimeout(activityTimer);
    clearTimeout(motionTimer);
    clearMotionClasses();
    forcedUntil = 0;
    automaticPose();
  } else {
    scheduleActivity(5000);
  }
});
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
  scheduleActivity(5000);
});
