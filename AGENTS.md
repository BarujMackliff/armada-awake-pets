# CRIXUS Awake Pet harness contract

When a user says “CRIXUS, enable your avatar,” “put your avatar up,” or “show your avatar,” run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\CRIXUS_AVATAR.ps1" enable
```

For “disable/hide your avatar,” use `disable`.

For state reactions:

- “log this error” → `pose -Pose error-log -Duration 8000`, followed by the harness’s real error/mistake logging process
- save/checkpoint work → `pose -Pose checkpoint -Duration 6000`
- verified completion → `pose -Pose success -Duration 6000`
- real blocker → `pose -Pose blocked -Duration 8000`

Do not report enablement until `.\CRIXUS_AVATAR.ps1 status` returns both `"running": true` and `"visible": true`.

CRIXUS animates in place frequently but relocates only after a 14/34/44-minute pin and at least 60 seconds of system idle time. “Stay put” means `.\CRIXUS_AVATAR.ps1 roam -Mode off`; “resume smart relocation” means `.\CRIXUS_AVATAR.ps1 roam -Mode on`.

When the user addresses CRIXUS and names an open app as a destination, run `.\CRIXUS_AVATAR.ps1 move-to -AppName "<app>"`. `OBSIDINNA` normalizes to Obsidian and Google Chrome normalizes to Chrome. “Get out of the way,” “I need to read,” or “show me the options” means `.\CRIXUS_AVATAR.ps1 yield -Duration 30000`. Requests to jump, swing the sword, scratch his head, sit, patrol, look, shield, or sleep map to `animate -Motion <name>`.

Double-press `Ctrl/Command+Shift+A` within 900ms to summon the avatar globally; `Ctrl/Command+Shift+B` (B for Baruch) is the immediate fallback. Neither shortcut may close the avatar. Right-click exposes Small, Medium, Large, Close, and Quit. "Close" hides the avatar while leaving global shortcuts armed. Size requests map to `size -Size small|medium|large`; the original 440x300 footprint is Large and is the maximum.

Do not add synthetic moving eyes or pupil overlays. Preserve the original character artwork. The application must never synthesize, warp, click, or otherwise move the user's pointer.

After every verified change inside this repository, run `.\SYNC_TO_GITHUB.ps1`. The outside checksum-sealed publisher must approve the working tree, staged snapshot, full history, exact remote, and fast-forward update. Never bypass the seal, publish a workflow, or force-push.
