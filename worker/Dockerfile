# Playwright's own image ships a Chromium build matched to the installed
# playwright version plus every OS-level dependency headless Chromium needs
# — avoids hand-maintaining a fonts/libgtk/libnss apt-get list on top of a
# bare node:20 image.
FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS runner
WORKDIR /app

# NODE_ENV=production must come AFTER npm ci/build below, not before —
# npm skips devDependencies (typescript, tsx) when NODE_ENV=production is
# already set, which breaks `npm run build`'s `tsc` step. Once compiled,
# nothing at runtime needs the dev deps, so it's set just before CMD.
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production

# Playwright's browsers are already baked into this base image (matching
# the pinned playwright version above), so no `playwright install` step —
# running it again here would just re-download the same browser.
CMD ["node", "dist/index.js"]
