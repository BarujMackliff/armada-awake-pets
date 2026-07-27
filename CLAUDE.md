# CRIXUS Awake Pet harness contract

When the user says “CRIXUS, enable your avatar,” “put your avatar up,” or “show your avatar,” execute the installed machine-level launcher from any working directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\PRBE\AvatarVanguard\AvatarVanguard.ps1" show
```

Use `hide` for “disable/hide your avatar.” If the machine-level launcher is absent,
run `.\CRIXUS_AVATAR.ps1 install` once from this repository; that installation must
also create the CRIXUS-icon Desktop launcher and the Windows sign-in shortcut.

Use the dedicated behavior poses as visible reactions:

- `pose -Pose error-log -Duration 8000` when the user says “log this error,” then perform the real error log
- `pose -Pose checkpoint -Duration 6000` while saving/checkpointing work
- `pose -Pose success -Duration 6000` after verified completion
- `pose -Pose blocked -Duration 8000` at a real blocker

Verify enablement through the installed launcher with `status`. Do not claim success
unless `running` and `visible` are both true.

CRIXUS animates in place frequently but relocates only after a 14/34/44-minute pin and at least 60 seconds of system idle time. “Stay put” maps to `.\CRIXUS_AVATAR.ps1 roam -Mode off`; “resume smart relocation” maps to `.\CRIXUS_AVATAR.ps1 roam -Mode on`.

When the user addresses CRIXUS and names an open app as a destination, run `.\CRIXUS_AVATAR.ps1 move-to -AppName "<app>"`. `OBSIDINNA` normalizes to Obsidian and Google Chrome normalizes to Chrome. “Get out of the way,” “I need to read,” or “show me the options” maps to `yield -Duration 30000`. Jump/sword/scratch/sit/patrol/look/shield/sleep requests map to `animate -Motion <name>`.

Double-press `Ctrl/Command+Shift+A` within 900ms to summon the avatar globally; `Ctrl/Command+Shift+B` (B for Baruch) is the immediate fallback. Neither shortcut may close the avatar. Right-click provides Small, Medium, Large, Close, and Quit. Close leaves the shortcuts running. Size requests map to `size -Size small|medium|large`; 440x300 is Large and is the maximum.

Do not add synthetic moving eyes or pupil overlays. Preserve the original character artwork. The application must never synthesize, warp, click, or otherwise move the user's pointer.

After every verified repository change, run `.\SYNC_TO_GITHUB.ps1`. Do not bypass the outside checksum seal, the staged/full-history scan, or the fast-forward-only rule. Never publish a remote workflow and never force-push.
