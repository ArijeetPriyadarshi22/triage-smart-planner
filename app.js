class SmartApp {
  constructor() {
    this.USE_STUB = true; // set to false to attempt real network calls
    this.root = null;
    // UI state
    this.state = {
      pipelineStep: 0,
      trust: { a: 0, b: 0, c: 0 },
      ai: { label: '', text: '', visible: false },
      results: null, // null = idle, [] = no results, [..] = hotels
      loading: false
    };

    // form state (kept in sync with inputs)
    this.form = {
      dest: '', guests: '2 adults', checkin: '', checkout: '', sortby: 'Best match', chips: new Set()
    };

    // refs populated in init
    this.refs = {};

    // bind
    this.onClick = this.onClick.bind(this);
    this.onInput = this.onInput.bind(this);
    this.onKeydown = this.onKeydown.bind(this);
  }

  init() {
    this.root = document.querySelector('.app');
    if (!this.root) return;

    // container refs
    this.containers = {
      resultsArea: this.root.querySelector('#resultsArea'),
      pipeline: this.root.querySelector('#pipeline'),
      trustPanel: this.root.querySelector('#trustPanel'),
      aiOut: this.root.querySelector('#aiOut'),
      aiLabel: this.root.querySelector('#aiLabel'),
      aiText: this.root.querySelector('#aiText')
    };

    // form refs (cached)
    this.refs = {
      dest: this.root.querySelector('#dest'),
      guests: this.root.querySelector('#guests'),
      checkin: this.root.querySelector('#checkin'),
      checkout: this.root.querySelector('#checkout'),
      sortby: this.root.querySelector('#sortby'),
      chips: this.root.querySelector('#chips'),
      searchBtn: this.root.querySelector('#searchBtn'),
      aiQuery: this.root.querySelector('#aiQuery'),
      aiBtn: this.root.querySelector('#aiBtn')
    };

    // init form from DOM values (keeps backwards compatibility)
    if (this.refs.dest) this.form.dest = this.refs.dest.value || this.form.dest;
    if (this.refs.guests) this.form.guests = this.refs.guests.value || this.form.guests;
    if (this.refs.checkin) this.form.checkin = this.refs.checkin.value || this.form.checkin;
    if (this.refs.checkout) this.form.checkout = this.refs.checkout.value || this.form.checkout;
    if (this.refs.sortby) this.form.sortby = this.refs.sortby.value || this.form.sortby;

    // gather initially selected chips
    if (this.refs.chips) {
      const on = this.refs.chips.querySelectorAll('.chip.on');
      on.forEach(c => { if (c.dataset && c.dataset.v) this.form.chips.add(c.dataset.v); });
    }

    this.setDateDefaults();

    this.bind();
    this.render();
  }

  bind() {
    // delegated click for chips + buttons
    this.root.addEventListener('click', this.onClick);
    // input/change bindings for form fields
    ['input','change'].forEach(evt => {
      if (this.refs.dest) this.refs.dest.addEventListener(evt, this.onInput);
      if (this.refs.guests) this.refs.guests.addEventListener(evt, this.onInput);
      if (this.refs.checkin) this.refs.checkin.addEventListener(evt, this.onInput);
      if (this.refs.checkout) this.refs.checkout.addEventListener(evt, this.onInput);
      if (this.refs.sortby) this.refs.sortby.addEventListener(evt, this.onInput);
    });

    // keydown for AI textarea
    if (this.refs.aiQuery) this.refs.aiQuery.addEventListener('keydown', this.onKeydown);
  }

  onClick(e) {
    const el = e.target.closest && e.target.closest('*');
    if (!el) return;

    // chip toggle
    if (el.classList && el.classList.contains('chip')) {
      const v = el.dataset && el.dataset.v;
      if (this.form.chips.has(v)) { this.form.chips.delete(v); el.classList.remove('on'); }
      else { if (v) this.form.chips.add(v); el.classList.add('on'); }
      return;
    }

    // search button
    if (el.id === 'searchBtn') {
      e.preventDefault(); this.runSearch(); return;
    }

    // ai button
    if (el.id === 'aiBtn') {
      e.preventDefault(); this.runAISearch(); return;
    }
  }

  onInput(e) {
    const t = e.target;
    if (!t) return;
    if (t === this.refs.dest) this.form.dest = t.value.trim();
    if (t === this.refs.guests) this.form.guests = t.value;
    if (t === this.refs.checkin) this.form.checkin = t.value;
    if (t === this.refs.checkout) this.form.checkout = t.value;
    if (t === this.refs.sortby) this.form.sortby = t.value;
  }

  onKeydown(e) {
    const target = e.target;
    if (target && target === this.refs.aiQuery) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.runAISearch(); }
    }
  }

  setDateDefaults() {
    const fmt = d => d.toISOString().split('T')[0];
    const shift = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const today = new Date();
    const ci = fmt(shift(today, 14));
    const co = fmt(shift(today, 17));
    if (this.refs.checkin && !this.refs.checkin.value) { this.refs.checkin.value = ci; this.form.checkin = ci; }
    if (this.refs.checkout && !this.refs.checkout.value) { this.refs.checkout.value = co; this.form.checkout = co; }
  }

  rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  // central render method updates the UI from state and form
  render() {
    // pipeline
    const step = this.state.pipelineStep;
    if (this.containers.pipeline) this.containers.pipeline.style.display = step > 0 ? 'flex' : 'none';
    ['p1','p2','p3','p4'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = 'pip' + (i + 1 < step ? ' done' : i + 1 === step ? ' active' : '');
    });

    // trust panel
    if (this.containers.trustPanel) {
      if (this.state.trust && (this.state.trust.a || this.state.trust.b || this.state.trust.c)) {
        this.containers.trustPanel.style.display = 'block';
        [['tf1','tn1',this.state.trust.a],['tf2','tn2',this.state.trust.b],['tf3','tn3',this.state.trust.c]].forEach(([bar,num,v]) => {
          const barEl = document.getElementById(bar); const numEl = document.getElementById(num);
          if (barEl) barEl.style.width = (v || 0) + '%';
          if (numEl) numEl.textContent = (v != null ? v + '%' : '—');
        });
      } else {
        this.containers.trustPanel.style.display = 'none';
      }
    }

    // AI output
    if (this.containers.aiOut) {
      this.containers.aiOut.style.display = this.state.ai.visible ? 'block' : 'none';
      if (this.containers.aiLabel) this.containers.aiLabel.innerHTML = this.state.ai.label || '';
      if (this.containers.aiText) this.containers.aiText.textContent = this.state.ai.text || '';
    }

    // results area
    if (this.containers.resultsArea) {
      if (this.state.loading) {
        this.containers.resultsArea.innerHTML = '<div class="empty"><div class="dots"><span></span><span></span><span></span></div></div>';
      } else if (!this.state.results) {
        this.containers.resultsArea.innerHTML = '<div class="empty"><div class="empty-icon">🏨</div><div class="empty-txt">Search for hotels or describe your trip above</div></div>';
      } else if (Array.isArray(this.state.results) && this.state.results.length === 0) {
        this.containers.resultsArea.innerHTML = '<div class="empty"><div class="empty-icon">😕</div><div class="empty-txt">No hotels found. Try adjusting your search.</div></div>';
      } else {
        // render hotel cards
        const hotels = this.state.results || [];
        const EMOJIS = ['🏨','🏩','🌆','🌇','🏙','🛎','🌃','🏖'];
        const cards = hotels.map(h => {
          const score = h.rating || (this.rnd(75, 97) / 10).toFixed(1);
          const price = h.price || this.rnd(79, 289);
          const label = score >= 9 ? 'Exceptional' : score >= 8.5 ? 'Excellent' : score >= 8 ? 'Very good' : 'Good';
          const emoji = EMOJIS[this.rnd(0, EMOJIS.length - 1)];
          const tags = (h.amenities || ['Free WiFi','Breakfast','City center']).slice(0, 3);
          return `
            <div class="hotel-card">
              <div class="hotel-thumb">${emoji}</div>
              <div class="hotel-body">
                <div class="hotel-name">${h.name || 'Hotel'}</div>
                <div class="hotel-loc">📍 ${h.location || h.address || 'City center'}</div>
                <div class="hotel-tags">${tags.map(t => `<span class="htag">${t}</span>`).join('')}</div>
                <div class="hotel-score">
                  <span class="score-num">${score}</span>
                  <span class="score-lbl">${label} · ${this.rnd(120, 3200)} reviews</span>
                </div>
              </div>
              <div class="hotel-price">
                <div class="price-from">from</div>
                <div class="price-val">€${price}</div>
                <div class="price-night">per night</div>
              </div>
            </div>
          `;
        }).join('');
        this.containers.resultsArea.innerHTML = `<p class="results-head">Hotels found (${hotels.length})</p><div class="hotel-list" id="hlist">${cards}</div>`;
      }
    }
  }

  parseMCPHotels(result) {
    const content = result?.content || result?.result?.content || [];
    const block = Array.isArray(content) && content.find(b => b.type === 'text');
    if (!block) return [];
    try { const p = JSON.parse(block.text); return p.accommodations || p.hotels || p.results || (Array.isArray(p) ? p : []); } catch { return []; }
  }

  demoHotels(dest = 'Destination', prefs = []) {
    const names = [
      `${dest} Grand Hotel`, `The ${dest} Boutique`, `Hotel Central ${dest}`,
      `${dest} Suites & Spa`, `The Modern ${dest}`, `${dest} City Lodge`
    ];
    const locs = ['City center','Old town','Near train station','Historic district','Business district','Riverside'];
    const tagSets = [
      ['Free WiFi','Pool','Spa'], ['Free WiFi','Breakfast','Parking'],
      ['Free WiFi','City center','Bar'], ['Breakfast','Pool','Gym'],
      ['Free WiFi','Pets OK','Garden'], ['Breakfast','Concierge','Rooftop']
    ];
    return names.map((name, i) => ({
      name,
      location: locs[i % locs.length],
      rating: (this.rnd(78, 97) / 10).toFixed(1),
      price: this.rnd(79, 329),
      amenities: tagSets[i % tagSets.length]
    }));
  }

  async mcpSearch(args) {
    if (this.USE_STUB) {
      await this.delay(300);
      return { stub: true, results: this.demoHotels(args.destination || args.query || 'Demo', args.filters?.amenities || []) };
    }

    const body = {
      jsonrpc: '2.0', id: Math.random().toString(36).slice(2),
      method: 'tools/call', params: { name: 'trivago-accommodation-search', arguments: args }
    };
    const resp = await fetch('https://mcp.trivago.com/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error('MCP HTTP ' + resp.status);
    const text = await resp.text();
    const lines = text.split('\n').filter(l => l.startsWith('data:'));
    for (const line of lines) {
      try { const d = JSON.parse(line.slice(5)); if (d.result) return d.result; } catch {}
    }
    try { return JSON.parse(text); } catch { return text; }
  }

  // public actions
  async runSearch() {
    const dest = (this.form.dest || '').trim();
    if (!dest) { alert('Please enter a destination'); return; }
    const checkin = this.form.checkin; const checkout = this.form.checkout;
    const guestsVal = this.form.guests || '1 adult';
    const prefs = Array.from(this.form.chips || []);

    if (this.refs.searchBtn) { this.refs.searchBtn.disabled = true; this.refs.searchBtn.textContent = 'Searching…'; }
    this.state.loading = true; this.state.results = null; this.state.ai.visible = false; this.state.trust = { a:0,b:0,c:0 }; this.state.pipelineStep = 0; this.render();

    try {
      this.state.pipelineStep = 1; this.render(); await this.delay(350);
      this.state.pipelineStep = 2; this.render();

      let hotels = [];
      try {
        const result = await this.mcpSearch({
          query: `${dest} ${prefs.join(' ')} hotel`, destination: dest, checkIn: checkin, checkOut: checkout,
          guests: guestsVal.startsWith('2') ? 2 : 1,
          filters: prefs.length ? { amenities: prefs } : undefined
        });
        hotels = result?.results || this.parseMCPHotels(result) || [];
      } catch (e) { console.warn('MCP call failed, using demo data:', e); }

      this.state.pipelineStep = 3; this.render(); await this.delay(300);

      if (!hotels.length) hotels = this.demoHotels(dest, prefs);

      const pa = this.rnd(82, 96), rr = this.rnd(78, 94), pm = this.rnd(65 + prefs.length * 4, 96);
      this.state.trust = { a: pa, b: rr, c: pm };

      this.state.pipelineStep = 4; this.state.results = hotels; this.state.loading = false; this.render(); await this.delay(150);

    } catch (e) {
      this.state.results = [];
      this.state.loading = false;
      this.containers.resultsArea && (this.containers.resultsArea.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-txt">Search error. Try again or use the AI bar.</div></div>');
    } finally {
      if (this.refs.searchBtn) { this.refs.searchBtn.disabled = false; this.refs.searchBtn.textContent = 'Search hotels via trivago MCP'; }
      this.render();
    }
  }

  async runAISearch() {
    const q = (this.refs.aiQuery && this.refs.aiQuery.value || '').trim(); if (!q) return;
    this.state.ai.visible = true; this.state.ai.label = '<div class="dots"><span></span><span></span><span></span></div> Thinking…'; this.state.ai.text = '';
    this.state.loading = true; this.state.results = null; this.state.trust = { a:0,b:0,c:0 }; this.state.pipelineStep = 1; this.render();

    try {
      let parsed = null; let display = '';
      if (this.USE_STUB) {
        await this.delay(250);
        display = `Searching for: ${q}`;
        const destMatch = q.match(/in ([A-Z][a-z]+)|in ([A-Za-z ,]+)/i);
        parsed = { destination: destMatch ? (destMatch[1] || destMatch[2]).trim() : this.form.dest, checkIn: this.form.checkin, checkOut: this.form.checkout, guests: 2, amenities: [] };
      } else {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514', max_tokens: 1000,
            system: `You are a hotel search assistant powered by the trivago MCP server.\nExtract structured search intent from the user's natural language query.\nRespond with:\n1. A warm 2-3 sentence summary of what you understood and are searching for.\n2. A JSON block with keys: destination, checkIn (YYYY-MM-DD), checkOut (YYYY-MM-DD), guests (number), amenities (array of strings), sortBy.\nOutput only text + the JSON block. No markdown fences.`,
            messages: [{ role: 'user', content: q }]
          })
        });
        const data = await resp.json();
        const fullText = (data.content || []).map(b => b.text || '').join('');
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch {} }
        display = fullText.replace(/\{[\s\S]*\}/, '').trim();
      }

      this.state.ai.label = '✦ trivago AI'; this.state.ai.text = display; this.render();

      if (parsed) {
        if (parsed.destination) { this.form.dest = parsed.destination; if (this.refs.dest) this.refs.dest.value = parsed.destination; }
        if (parsed.checkIn) { this.form.checkin = parsed.checkIn; if (this.refs.checkin) this.refs.checkin.value = parsed.checkIn; }
        if (parsed.checkOut) { this.form.checkout = parsed.checkOut; if (this.refs.checkout) this.refs.checkout.value = parsed.checkOut; }
      }

      this.state.pipelineStep = 2; this.render(); await this.delay(450);
      this.state.pipelineStep = 3; this.render();

      let hotels = [];
      try {
        const dest = parsed?.destination || this.form.dest;
        const result = await this.mcpSearch({
          query: q, destination: dest,
          checkIn: parsed?.checkIn, checkOut: parsed?.checkOut,
          guests: parsed?.guests || 2,
          filters: parsed?.amenities?.length ? { amenities: parsed.amenities } : undefined
        });
        hotels = result?.results || this.parseMCPHotels(result) || [];
      } catch (e) { console.warn('MCP AI search failed:', e); }

      if (!hotels.length) hotels = this.demoHotels(parsed?.destination || 'your destination', parsed?.amenities || []);

      this.state.trust = { a: this.rnd(84,96), b: this.rnd(80,95), c: this.rnd(72,95) };
      this.state.pipelineStep = 4; this.state.results = hotels; this.state.loading = false; this.render();

    } catch (e) {
      this.state.ai.label = '⚠ Error'; this.state.ai.text = 'Could not process your request. Please try again.'; this.state.loading = false; this.render();
    }
  }
}

const App = new SmartApp();

// Auto-init when DOM is ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.init());
else App.init();

export default App;
