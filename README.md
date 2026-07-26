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
.\CRIXUS_AVATAR.ps1 pose error-log
.\CRIXUS_AVATAR.ps1 pose checkpoint
.\CRIXUS_AVATAR.ps1 pose success
```

The two `.cmd` launchers provide one-click enable and disable.

## Behavior

- Drag CRIXUS by the avatar across any connected monitor.
- CRIXUS breathes continuously and walks to a new position every 9–17 seconds without being touched.
- Roughly one in four autonomous walks can move him to another connected monitor.
- `roam -Mode off` makes him stay put; `roam -Mode on` resumes autonomous travel.
- One session: click the mission card to return to that task.
- Multiple sessions: click the card or chevron, then choose the exact task.
- Live session data comes from active `claude.exe --resume=<id>` processes and their local Claude transcript files.
- Task routing uses Anti-Gravity's registered Claude Code URI handler.
- The last cross-monitor position is restored on the next launch.
- The window stays click-through outside CRIXUS and his cards.

## Twelve visual states

`alert`, `working`, `walking`, `thinking`, `success`, `error-log`, `checkpoint`, `waiting`, `battle-ready`, `routing`, `blocked`, and `off-duty`.

## Local development

```powershell
npm.cmd install
npm.cmd test
npm.cmd start
```

The repository is designed as the first Armada Awake Pets character pack. Future agents can reuse the overlay engine while supplying their own original 12-state art set.

## GitHub synchronization

Every verified change can be tested, scanned for accidentally included credentials, committed, and pushed with:

```powershell
.\SYNC_TO_GITHUB.ps1
```

`START_GITHUB_AUTOSYNC.cmd` installs a current-user logon task that watches only this repository. After eight quiet seconds, it runs the full tests and safety scan before committing and pushing. `node_modules`, runtime files, temporary files, credential filenames, private keys, and recognizable access-token formats are blocked or ignored.

An optional Windows GitHub Actions workflow is retained locally. Publishing that workflow requires the GitHub CLI account to be granted the separate `workflow` OAuth scope; repository synchronization itself does not need that broader permission.
