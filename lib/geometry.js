"use strict";

function clampBounds(bounds, displays) {
  if (!Array.isArray(displays) || displays.length === 0) return bounds;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const display =
    displays.find(({ bounds: d }) =>
      centerX >= d.x && centerX < d.x + d.width && centerY >= d.y && centerY < d.y + d.height
    ) || displays[0];
  const area = display.workArea || display.bounds;
  return {
    ...bounds,
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height))
  };
}

function chooseRoamTarget(current, displays, options = {}) {
  if (!Array.isArray(displays) || displays.length === 0) return current;
  const random = options.random || Math.random;
  const crossMonitorChance = options.crossMonitorChance ?? 0.22;
  const margin = options.margin ?? 24;
  const centerX = current.x + current.width / 2;
  const centerY = current.y + current.height / 2;
  const currentIndex = Math.max(
    0,
    displays.findIndex(({ bounds }) =>
      centerX >= bounds.x && centerX < bounds.x + bounds.width &&
      centerY >= bounds.y && centerY < bounds.y + bounds.height
    )
  );
  let targetDisplay = displays[currentIndex];
  if (displays.length > 1 && random() < crossMonitorChance) {
    const others = displays.filter((_, index) => index !== currentIndex);
    targetDisplay = others[Math.floor(random() * others.length)];
  }
  const area = targetDisplay.workArea || targetDisplay.bounds;
  const maxX = Math.max(area.x + margin, area.x + area.width - current.width - margin);
  const maxY = Math.max(area.y + margin, area.y + area.height - current.height - margin);
  const x = Math.round(area.x + margin + random() * Math.max(0, maxX - area.x - margin));
  const y = Math.round(area.y + margin + random() * Math.max(0, maxY - area.y - margin));
  return clampBounds({ ...current, x, y }, displays);
}

function rectanglesOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function chooseSafeEdgeTarget(display, cursor, petSize, activeWindow = null) {
  const area = display.workArea || display.bounds;
  const margin = 24;
  const width = petSize.width;
  const height = petSize.height;
  const left = area.x + margin;
  const right = area.x + area.width - width - margin;
  const top = area.y + margin;
  const bottom = area.y + area.height - height - margin;
  const centerX = Math.round(area.x + (area.width - width) / 2);
  const centerY = Math.round(area.y + (area.height - height) / 2);
  const candidates = [
    { x: left, y: top, width, height },
    { x: right, y: top, width, height },
    { x: left, y: bottom, width, height },
    { x: right, y: bottom, width, height },
    { x: left, y: centerY, width, height },
    { x: right, y: centerY, width, height },
    { x: centerX, y: top, width, height },
    { x: centerX, y: bottom, width, height }
  ];
  return candidates
    .map((candidate) => {
      const candidateCenter = {
        x: candidate.x + candidate.width / 2,
        y: candidate.y + candidate.height / 2
      };
      const cursorDistance = Math.hypot(candidateCenter.x - cursor.x, candidateCenter.y - cursor.y);
      const outsideActiveWindow = activeWindow && !rectanglesOverlap(candidate, activeWindow) ? 100_000 : 0;
      const bottomBias = candidate.y === bottom ? 120 : 0;
      return { candidate, score: cursorDistance + outsideActiveWindow + bottomBias };
    })
    .sort((a, b) => b.score - a.score)[0].candidate;
}

module.exports = { clampBounds, chooseRoamTarget, chooseSafeEdgeTarget, rectanglesOverlap };
