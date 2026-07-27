# CRIXUS Awake Pet

An original, reusable desktop-companion engine with a CRIXUS character pack. It
discovers active Claude Code sessions running inside Anti-Gravity, shows their live
titles and recent status, and routes a click back to the exact session.

Public home: [BarujMackliff/armada-awake-pets](https://github.com/BarujMackliff/armada-awake-pets)

## Everyday controls

- Run `.\CRIXUS_AVATAR.ps1 install` once after `npm.cmd install`. This creates:
  - a **Desktop launcher with the CRIXUS icon**,
  - a Windows sign-in launcher that keeps the hotkeys armed, and
  - a stable machine-level agent command at
    `%LOCALAPPDATA%\PRBE\AvatarVanguard\AvatarVanguard.ps1`.
- Double-click **Avatar Vanguard - CRIXUS** on the Desktop to show him.
- Windows: double-press `Ctrl+Shift+A` to summon the avatar.
- macOS: double-press `Command+Shift+A` to summon the avatar.
- Fallback: `Ctrl+Shift+B` or `Command+Shift+B`—B for Baruch—summons immediately.
- The global shortcuts never close the avatar.
- Right-click the avatar for Small, Medium, Large, Smart relocation, Close, and Quit.
- **Close avatar** hides the window but keeps the shortcuts armed; **Quit Awake Pet**
  exits the background process.
- Large is the original and maximum 440 by 300 size. Medium is 370 by 252. Small is
  299 by 204.
- The original character artwork, including its eyes, is displayed unchanged. There
  is no synthetic pupil overlay. The application has no pointer-warping capability
  and never moves the mouse.

## Commands

```powershell
.\CRIXUS_AVATAR.ps1 install
.\CRIXUS_AVATAR.ps1 install-status
.\CRIXUS_AVATAR.ps1 uninstall
.\CRIXUS_AVATAR.ps1 show
.\CRIXUS_AVATAR.ps1 hide
.\CRIXUS_AVATAR.ps1 enable
.\CRIXUS_AVATAR.ps1 disable
.\CRIXUS_AVATAR.ps1 toggle
.\CRIXUS_AVATAR.ps1 status
.\CRIXUS_AVATAR.ps1 size -Size small
.\CRIXUS_AVATAR.ps1 size -Size medium
.\CRIXUS_AVATAR.ps1 size -Size large
.\CRIXUS_AVATAR.ps1 refresh
.\CRIXUS_AVATAR.ps1 route -SessionId <session-id>
.\CRIXUS_AVATAR.ps1 roam -Mode on
.\CRIXUS_AVATAR.ps1 roam -Mode off
.\CRIXUS_AVATAR.ps1 move-to -AppName Obsidian
.\CRIXUS_AVATAR.ps1 animate -Motion sword
.\CRIXUS_AVATAR.ps1 yield -Duration 30000
.\CRIXUS_AVATAR.ps1 pose success
```

The two legacy `.cmd` launchers still provide one-click enable and disable.
The individual `startup-enable|status|disable` and
`desktop-enable|status|disable` actions remain available for repair and support.
Run `install` again if the repository is moved to another folder.

Any local agent can show the installed avatar from any working directory with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\PRBE\AvatarVanguard\AvatarVanguard.ps1" show
```

## Behavior

- Drag the avatar across any connected monitor. It walks and faces the drag direction.
- A manual drop restores exactly after restart and starts a random 14, 34, or
  44-minute position pin.
- Frequent breathing, jumping, sword work, thinking, sitting, patrols, looking,
  shielding, and sleeping happen inside the existing footprint.
- Smart relocation is rare and requires both an expired pin and at least 60 seconds
  of system idle time.
- Relocation selects a safe display edge away from the pointer and active content.
- Hovering over the avatar for 1.2 seconds makes it fade and become click-through.
- `yield` temporarily removes the avatar; `roam off` keeps personality while disabling
  window relocation.
- One session routes with one click; multiple sessions open an exact-session chooser.
- The picker collapses automatically after 15 seconds.
- The operating system's reduced-motion preference is honored.
- In-place animation pauses on battery power and resumes on AC power.
- An abnormal renderer exit writes a local diagnostic receipt and recovers the window,
  capped at three attempts per minute.

## Reusable character packs

Fork the repository, edit `character.json`, and replace the twelve transparent image
paths in its `assets` map. The engine validates every required state at startup.

The states are `alert`, `working`, `walking`, `thinking`, `success`, `error-log`,
`checkpoint`, `waiting`, `battle-ready`, `routing`, `blocked`, and `off-duty`.

## Local development

```powershell
npm.cmd install
npm.cmd test
npm.cmd start
```

## Protected publication boundary

This public repository is only for the Awake Pet application. Before first publishing,
install the checksum-sealed gate outside the repository:

```powershell
.\INSTALL_SECURITY_GATES.ps1
```

Then publish only through:

```powershell
.\SYNC_TO_GITHUB.ps1
```

The publisher fails closed unless tests pass and the outside scanner approves the
working tree, staged snapshot, complete history, exact repository, exact remote,
checksums, and fast-forward push. Local hooks repeat the sealed scan on commit and
push. Remote workflow files are blocked and GitHub Actions can remain disabled,
reducing the public repository's attack surface. See [SECURITY.md](SECURITY.md).
