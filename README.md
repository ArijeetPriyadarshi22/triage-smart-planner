trivago-smart-planner
======================

A front-end demo that demonstrates a compact UI for Trivago Smart Planner (MCP + AI demo). It's a
two-mode hotel search interface. The structured form calls trivago-accommodation-search via the MCP 
server directly, while the natural language bar uses the Claude API to parse travel intent (extracting 
destination, dates, guest count, preferences) and then fires the MCP search.

Quick start
-----------

1. (Optional) Install dev dependencies:

   ```bash
   npm install
   ```

2. Start a local static server (this project includes an npm script that uses http-server via npx):

   ```bash
   npm start
   ```

   Or run the server directly with npx:

   ```bash
   npx http-server ./src -o -c-1
   ```

What’s in this repo
-------------------

- `src/index.html` — main HTML file 
- `src/styles.css` — for styling
- `src/app.js` — main application JavaScript

