# Tauri Desktop E2E Test Checklist

## Prerequisites
- `pnpm tauri:dev` running
- User logged in (create account or QR scan)

## Test Cases

### TC-01: Window Launch
- [ ] App opens at ~1680x1050 (not 800x600)
- [ ] Window has minimum size constraint (~900px wide)
- [ ] Title bar shows "BFELAB (dev)"

### TC-02: Desktop Layout (logged in)
- [ ] SidebarView shows BFELAB branding and the New Session entry without overlap
- [ ] Current route content renders beside the sidebar
- [ ] The sidebar divider is visible

### TC-03: Navigation Persistence
- [ ] Click Settings row → Settings opens, sidebar stays
- [ ] Click New Session → "Start New Session" opens, sidebar stays
- [ ] Navigate back → Previous view restores, sidebar unchanged throughout

### TC-04: Zen Mode
- [ ] Press Cmd+0 → Both side panels disappear, center fills window
- [ ] Press Cmd+0 again → Side panels restore
- [ ] Zen state persists after page navigation

### TC-05: System Tray
- [ ] BFELAB icon visible in macOS menu bar
- [ ] Click tray icon → Menu appears with: Show Window, sessions, New Session, Quit BFELAB
- [ ] Click "Quit" → App exits

### TC-06: Close Confirmation
- [ ] Click red close button (traffic lights)
- [ ] Native dialog: "Are you sure you want to quit?" with Yes/No
- [ ] Click "No" → Window stays open
- [ ] Click "Yes" → App exits

### TC-07: Dark Mode
- [ ] Switch to dark mode in Settings → Appearance
- [ ] Sidebar and content render correctly in dark mode
- [ ] No white flashes or broken colors

### TC-08: Content Width
- [ ] Content in center column has reasonable max-width (not stretching edge-to-edge)
- [ ] Images/logos don't overflow or become oversized
- [ ] Text remains readable width

### TC-09: No Console Errors
- [ ] Open DevTools (Cmd+Option+I if available)
- [ ] No red errors related to our changes (isTauri, notifications, layout)
- [ ] "12000ms timeout" is pre-existing, acceptable

### TC-10: Mobile/Web Regression
- [ ] Open `http://localhost:8081` in regular browser
- [ ] Shows normal web layout (no three-column, no ContextPanel)
- [ ] No Tauri-related errors in browser console

### TC-11: Desktop Auth Persistence
- [ ] Install or launch a preview/production BFELAB desktop build
- [ ] Complete account association/authentication
- [ ] Quit via tray menu → `Quit BFELAB`
- [ ] Reopen BFELAB → app restores authenticated state without asking to associate again
- [ ] Click Settings → Account → Logout
- [ ] Quit and reopen BFELAB → app requires authentication again
