# CRIXUS Awake Pet

An original cross-monitor desktop companion for CRIXUS. It discovers active Claude Code sessions running inside Anti-Gravity, shows their live titles and recent status, and routes a click back to the exact session.

Public home: [BarujMackliff/armada-awake-pets](https://github.com/BarujMackliff/armada-awake-pets)

## Commands

```powershell
.\CRIXUS_AVATAR.ps1 enable
.\CRIXUS_AVATAR.ps1 disable
.\CRIXUS_AVATAR.ps1 status
.\CRIXUS_AVATAR.ps1 refresh
.\CRIXUS_AVATAR.ps1 route -SessionId <session-id>
.\CRIXUS_AVATAR.ps1 roam -Mode on
.\CRIXUS_AVATAR.ps1 roam -Mode off
.\CRIXUS_AVATAR.ps1 move-to -AppName Obsidian
.\CRIXUS_AVATAR.ps1 animate -Motion sword
.\CRIXUS_AVATAR.ps1 yield -Duration 30000
.\CRIXUS_AVATAR.ps1 pose error-log
.\CRIXUS_AVATAR.ps1 pose checkpoint
.\CRIXUS_AVATAR.ps1 pose success
```

The two `.cmd` launchers provide one-click enable and disable.

## Behavior

- Drag CRIXUS by the avatar across any connected monitor.
- While manually dragged, CRIXUS changes to the walking pose and faces left or right with the pointer.
- A manual drop pins the exact position for a randomly selected 14, 34, or 44 minutes.
- CRIXUS frequently comes alive **inside his existing footprint**: breathing, jumping, sword work, scratching his head, sitting, short patrols, looking around, shielding, and sleeping.
- Smart relocation is rare. It is eligible only after the long pin expires and Windows reports at least 60 seconds without keyboard or mouse input.
- A smart relocation follows the foreground app's display and selects a screen edge far from the cursor instead of jumping onto the reading or typing area.
- `move-to -AppName Obsidian` (including the spoken typo `OBSIDINNA`) or `move-to -AppName "Google Chrome"` targets an open app without keylogging. Chrome chooses an open Chrome window rather than assuming the active typing window.
- Hovering over the avatar for 1.2 seconds makes it fade and become click-through, so covered menus or dropdown choices become readable and clickable. Move the pointer away to restore it.
- `yield` temporarily gets CRIXUS entirely out of the way.
- `roam -Mode off` disables window relocation but leaves in-place life animations running; `roam -Mode on` enables the guarded long-cooldown behavior.
- One session: click the mission card to return to that task.
- Multiple sessions: click the card or chevron, then choose the exact task.
- Live session data comes from active `claude.exe --resume=<id>` processes and their local Claude transcript files.
- Task routing uses Anti-Gravity's registered Claude Code URI handler.
- The last cross-monitor position is restored on the next launch.
- The window stays click-through outside CRIXUS and his cards.
- The multi-session picker closes automatically after 15 seconds so it cannot remain over the workspace.

## Twelve visual states

`alert`, `working`, `walking`, `thinking`, `success`, `error-log`, `checkpoint`, `waiting`, `battle-ready`, `routing`, `blocked`, and `off-duty`.

## Local development

```powershell
npm.cmd install
npm.cmd test
npm.cmd start
```

The repository is designed as the first Armada Awake Pets character pack. Future agents can reuse the overlay engine while supplying their own original 12-state art set.

## Create another avatar

Fork the repository, edit `character.json`, and replace the twelve transparent PNG paths in its `assets` map. The engine validates every required state at startup, so an incomplete or unsafe pack fails clearly instead of displaying a broken pet.

The reusable states are: `alert`, `working`, `walking`, `thinking`, `success`, `error-log`, `checkpoint`, `waiting`, `battle-ready`, `routing`, `blocked`, and `off-duty`.

## GitHub synchronization

Every verified change can be tested, scanned for accidentally included credentials, committed, and pushed with:

```powershell
.\SYNC_TO_GITHUB.ps1
```

`START_GITHUB_AUTOSYNC.cmd` installs a persistent current-user watcher (Scheduled Task when permitted, otherwise a no-admin Startup shortcut) for only this repository. After eight quiet seconds, it runs the full tests and safety scan before committing and pushing. `node_modules`, runtime files, temporary files, credential filenames, private keys, and recognizable access-token formats are blocked or ignored.

An optional Windows GitHub Actions workflow is retained locally. Publishing that workflow requires the GitHub CLI account to be granted the separate `workflow` OAuth scope; repository synchronization itself does not need that broader permission.
