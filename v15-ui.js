/* V1.7 local presentation layer. All artwork is independently loadable from assets/. */
(function () {
  'use strict';
  const root = 'assets/';
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const make = (path, className, label = '') => {
    const el = document.createElement('img');
    el.src = root + path;
    el.className = className;
    el.alt = label;
    el.loading = 'eager';
    el.decoding = 'async';
    return el;
  };
  const add = (host, path, className, label = '') => {
    if (!host) return;
    const el = make(path, className, label);
    host.append(el);
    return el;
  };
  const prepend = (host, path, className, label = '') => {
    if (!host) return;
    const el = make(path, className, label);
    host.prepend(el);
    return el;
  };
  const humanAvatars = [
    {id:'dietitian',label:'營養師',path:'avatars/dietitian.png'},
    {id:'chef',label:'廚師',path:'avatars/chef.png'},
    {id:'chef-alt',label:'廚師・另一造型',path:'avatars/chef-alt.png'}
  ];
  window.v15AvatarSelection = new Map();
  window.v15DiceFacePreloads = Array.from({length:6},(_,i) => {
    const img = new Image();
    img.src = `${root}game/dice-${i+1}.png`;
    return img;
  });
  const avatar = player => player?.isComputer ? 'avatars/computer.png' :
    humanAvatars.find(x => x.id === player?.avatarId)?.path || null;
  const food = ['rice', 'vegetable', 'fish', 'chicken', 'egg', 'tofu', 'tomato', 'broccoli', 'carrot', 'mushroom', 'soup', 'meal-tray'];
  const tileArt = {0:'start',4:'tile-reward',8:'tile-event',12:'tile-reward',16:'tile-event',19:'goal'};
  const questionArt = ['tile-rice','tile-vegetable','tile-protein','tile-spoon','tile-question'];

  function decorateShell() {
    const brand = $('.brand-icon');
    if (brand && !brand.querySelector('img')) {
      brand.textContent = '';
      add(brand, 'ui/chef-hat.svg', 'brand-mark');
    }
    const nav = ['home','players','questions','results'];
    $$('nav [data-page]').forEach((button, index) => {
      if (!$('img', button)) prepend(button, `ui/${nav[index]}.svg`, 'inline-icon');
    });
    const full = $('#fullscreen');
    if (full && !$('img', full)) prepend(full, 'ui/fullscreen.svg', 'inline-icon');
    const close = $('#image-close');
    if (close && !$('img', close)) prepend(close, 'ui/close.svg', 'inline-icon');
    const dialog = $('#confirm-dialog h2');
    if (dialog && !$('img', dialog)) prepend(dialog, 'ui/settings.svg', 'inline-icon');
  }

  function decorateHome(ctx) {
    const hero = $('.hero');
    const heroArt = $('.hero-art');
    if (!hero || !heroArt) return;
    add(heroArt, 'scenes/kitchen-vignette.png', 'hero-kitchen');
    add(heroArt, 'characters/dietitian-normal.png', 'hero-person hero-dietitian');
    add(heroArt, 'characters/chef-normal.png', 'hero-person hero-chef');
    add(heroArt, 'decor/sparkle.png', 'hero-sparkle');
    add(heroArt, 'decor/steam.png', 'hero-steam');
    add(hero, 'decor/tree.png', 'scene-tree');
    add(hero, 'decor/grass.png', 'scene-grass');
    add(hero, 'decor/sign.png', 'scene-sign');
    prepend($('.hero .eyebrow'), 'ui/leaf.svg', 'inline-icon');
    const picks = $$('.pick');
    picks.forEach(pick => {
      const playerId = $('input', pick)?.dataset.pick;
      const member = ctx.players.find(p => p.PlayerID === playerId);
      const wrapper = document.createElement('div');
      wrapper.className = 'picker-entry';
      wrapper.dataset.playerId = playerId;
      pick.before(wrapper);
      wrapper.append(pick);
      const choice = window.v15AvatarSelection.get(playerId);
      if (choice) prepend(pick, humanAvatars.find(x => x.id === choice)?.path, 'pick-avatar');
      else {
        const placeholder = document.createElement('span');
        placeholder.className = 'pick-avatar avatar-placeholder';
        placeholder.textContent = '?';
        pick.prepend(placeholder);
      }
      const chooser = document.createElement('div');
      chooser.className = 'avatar-chooser';
      chooser.setAttribute('role','group');
      chooser.setAttribute('aria-label',`${member?.Name || '玩家'}選擇人物造型`);
      for (const option of humanAvatars) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'avatar-choice';
        button.dataset.avatarChoice = option.id;
        button.title = option.label;
        button.setAttribute('aria-label',`${member?.Name || '玩家'}選擇${option.label}`);
        button.setAttribute('aria-pressed',String(choice === option.id));
        button.disabled = !!ctx.game;
        add(button, option.path, 'avatar-choice-image');
        const text = document.createElement('span');
        text.textContent = option.label;
        button.append(text);
        button.onclick = () => {
          window.v15AvatarSelection.set(playerId, option.id);
          $$('.avatar-choice', chooser).forEach(x => x.setAttribute('aria-pressed',String(x === button)));
          const shown = $('.pick-avatar', pick);
          shown?.replaceWith(make(option.path, 'pick-avatar'));
        };
        chooser.append(button);
      }
      wrapper.append(chooser);
    });
    prepend($('.setup .page-head h2'), 'ui/players.svg', 'inline-icon');
    prepend($('#start'), 'ui/play.svg', 'inline-icon');
    const rules = $('.setup aside');
    prepend($('h2', rules), 'ui/rules.svg', 'inline-icon');
    add(rules, 'characters/dietitian-explain.png', 'rules-person rules-dietitian');
    add(rules, 'characters/chef-thinking.png', 'rules-person rules-chef');
    add(rules, 'ui/spoon.svg', 'rules-decor rules-spoon');
    add(rules, 'ui/clipboard.svg', 'rules-decor rules-clipboard');
    add(rules, 'ui/hospital.svg', 'rules-decor rules-hospital');
    add(rules, 'food/meal-tray.png', 'rules-food');
    if ($('#resume')) prepend($('#resume'), 'ui/play.svg', 'inline-icon');
  }

  function decorateBoard(ctx) {
    const game = ctx.game;
    if (!game) return;
    let questionIndex = 0;
    $$('.tile').forEach((tile, index) => {
      const kind = tileArt[index] || questionArt[index % questionArt.length];
      const icon = $('.tile-icon', tile);
      if (icon) { icon.textContent = ''; add(icon, `board/${kind}.png`, 'tile-art'); }
      if (tile.classList.contains('question')) {
        add(tile, `food/${food[questionIndex++ % food.length]}.png`, 'tile-food');
        add(tile, 'board/path.png', 'tile-path');
      }
      if (tile.classList.contains('reward')) add(tile, 'feedback/reward.svg', 'tile-corner');
      if (tile.classList.contains('event')) add(tile, 'feedback/tip.svg', 'tile-corner');
      const tokens = $$('.token', tile);
      const present = game.members.filter(p => p.position === index);
      tokens.forEach((token, i) => {
        token.textContent = '';
        const art=avatar(present[i]);
        if (art) add(token, art, 'token-avatar');
        else token.textContent=String(present[i]?.token||i+1);
        if (ctx.busy) token.classList.add('token-moving');
      });
    });
    const center = $('.board-center');
    const plate = $('.plate', center);
    if (plate) { plate.textContent = ''; add(plate, 'food/meal-tray.png', 'center-tray'); }
    add(center, 'characters/dietitian-point.png', 'center-person center-dietitian');
    add(center, 'characters/chef-happy.png', 'center-person center-chef');
    add(center, 'decor/grass.png', 'center-grass');
    add(center, 'decor/sign.png', 'center-sign');
    $$('.roster-card').forEach((card, i) => {
      const token = $('.token', card);
      if (token) { const art=avatar(game.members[i]);if(art){token.textContent='';add(token, art, 'token-avatar');} }
      prepend($('.score', card), 'game/coin.png', 'inline-coin');
      add(card, 'game/coin-stack.png', 'roster-coins');
      if (i === game.current) {
        const result = game.pending?.answered ? game.pending.record : null;
        const event = game.phase === 'landed' ? game.message : '';
        const delta = result ? result.Score : event.includes('+10') ? 10 : event.includes('+5') ? 5 : event.includes('−5') ? -5 : null;
        if (delta !== null) {
          card.classList.add('score-changed');
          const pop=document.createElement('span');
          pop.className='coin-pop';
          pop.setAttribute('aria-hidden','true');
          pop.textContent=(delta>0?'+':'')+delta;
          card.append(pop);
        }
      }
    });
    const turn = $('.turn-label .token');
    if (turn) { const art=avatar(game.members[game.current]);if(art){turn.textContent='';add(turn, art, 'token-avatar');} }
    const dice = $('#dice') || document.createElement('span');
    dice.id = 'dice';
    dice.className = 'dice board-dice';
    dice.setAttribute('role','img');
    dice.setAttribute('aria-label',game.dice ? `上次擲出 ${game.dice} 點` : '準備擲骰');
    center.append(dice);
    dice.textContent = '';
    const face = game.dice >= 1 && game.dice <= 6 ? game.dice : 1;
    add(dice, `game/dice-${face}.png`, 'dice-face', `骰子 ${face} 點`);
    prepend($('#roll'), 'ui/play.svg', 'inline-icon');
    add($('.dice-area'), 'decor/sparkle.png', 'dice-sparkle');
    const eventIcon = $('.event-icon');
    if (eventIcon) {
      eventIcon.textContent = '';
      const at = game.members[game.current].position;
      add(eventIcon, at === 19 ? 'game/trophy.png' :
        [4,12].includes(at) ? 'game/coin-stack.png' :
        [8,16].includes(at) ? 'feedback/tip.svg' : 'board/path.png', 'event-art');
    }
    if (game.pending) decorateQuestion(game);
  }

  function decorateQuestion(game) {
    const q = game.pending.question;
    const panel = $('.play-panel');
    if (!panel) return;
    panel.classList.add('question-panel');
    add(panel, game.pending.answered ?
      game.pending.record.TimedOut ? 'characters/chef-thinking.png' :
      game.pending.record.IsCorrect ? 'characters/chef-correct.png' : 'characters/chef-wrong.png' :
      'characters/chef-thinking.png', 'question-person');
    const timer = $('#timer');
    if (timer) {
      timer.classList.toggle('countdown-ring', !game.pending.answered);
      prepend(timer, game.pending.record?.TimedOut ? 'feedback/timeout.svg' : 'feedback/hint.svg', 'inline-icon');
    }
    const note = $('.play-panel .note');
    if (note) prepend(note, 'feedback/hint.svg', 'inline-icon');
    const fb = $('.feedback');
    if (fb) {
      fb.classList.toggle('timeout-feedback', !!game.pending.record.TimedOut);
      prepend(fb, game.pending.record.TimedOut ? 'feedback/timeout.svg' :
        game.pending.record.IsCorrect ? 'feedback/correct.svg' : 'feedback/wrong.svg', 'feedback-icon');
      add(fb, game.pending.record.IsCorrect ? 'characters/dietitian-happy.png' :
        'characters/dietitian-explain.png', 'feedback-person');
      add(fb, 'decor/confetti.png', 'feedback-confetti');
    }
  }

  function decorateStats() {
    prepend($('.page-head h1'), 'ui/results.svg', 'inline-icon');
    prepend($('#export-excel'), 'ui/download.svg', 'inline-icon');
    prepend($('.stats-filter label'), 'ui/settings.svg', 'inline-icon');
    const metricIcons = ['ui/players.svg','ui/questions.svg','feedback/correct.svg','ui/clipboard.svg'];
    $$('.metric').forEach((card, i) => prepend(card, metricIcons[i], 'metric-icon'));
    $$('.result-card').forEach((card, i) => {
      const member = window.v15ResultPlayers?.[i];
      const art = avatar(member);
      if (art) prepend($('h3', card), art, 'result-avatar');
      prepend($('.result-meta strong', card), 'game/coin.png', 'inline-coin');
    });
    const grid = $('.result-grid');
    if (grid) {
      const banner = document.createElement('div');
      banner.className = 'result-celebration';
      const heading = document.createElement('strong');
      heading.textContent = '每一次作答，都是進步的紀錄';
      banner.append(heading);
      add(banner, 'game/trophy.png', 'results-trophy');
      add(banner, 'characters/chef-happy.png', 'results-person results-chef');
      add(banner, 'characters/dietitian-happy.png', 'results-person results-dietitian');
      add(banner, 'decor/confetti.png', 'results-confetti');
      grid.before(banner);
    }
    $$('.export-area button').forEach(button => prepend(button,
      button.id === 'clear-records' ? 'ui/close.svg' : 'ui/download.svg', 'inline-icon'));
  }

  function decorateCatalog(page) {
    prepend($('.page-head h1'), page === 'players' ? 'ui/players.svg' : 'ui/questions.svg', 'inline-icon');
    prepend($('.file-label'), 'ui/download.svg', 'inline-icon');
    const note = $('.note');
    if (note) prepend(note, page === 'players' ? 'ui/hospital.svg' : 'ui/clipboard.svg', 'inline-icon');
  }

  window.decorateV15 = (page, ctx) => {
    decorateShell();
    if (page === 'home') decorateHome(ctx);
    else if (page === 'game') decorateBoard(ctx);
    else if (page === 'stats') decorateStats(ctx);
    else if (page === 'players' || page === 'questions') decorateCatalog(page);
  };
})();
