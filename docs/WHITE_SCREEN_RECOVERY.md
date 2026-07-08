# White Screen Recovery

## Root Cause
A white screen after a deployment or during development often happens due to stale service workers or browser caching. A broken app shell (the initial cached HTML/JS that the service worker serves conditionally) can get stuck, preventing the browser from loading fixes from the network.

## How to Fix Locally
If you experience a white screen that persists across reloads:

1. Open Browser DevTools (F12 or Ctrl+Shift+I).
2. Go to the **Application** tab.
3. Select **Service Workers** from the left sidebar.
4. Click **Unregister** for any active service workers on the site.
5. Alternatively, click **Storage** in the sidebar, and check **Unregister service workers** and **Clear site data**, then click the **Clear site data** button.
6. Perform a **Hard Refresh** (Ctrl+F5 or Cmd+Shift+R).

## Current Status
Currently, Service Worker registration is **intentionally disabled** in the app development environment (e.g., `index.html` simply unregisters any existing ones safely). 

This helps ensure previews load the freshest application bundles and prevents "zombie" UI shells during iterative AI agent development.

## Re-enabling 
Service workers and the offline-first experience should be re-enabled only when the final production caching strategy is verified, and typically only when deployed to the production environment, not the preview.
