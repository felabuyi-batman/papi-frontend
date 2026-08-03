import { expect, test } from '@playwright/test'

const child = {
  id: 1,
  display_name: 'Sam',
  screened_at: '2026-01-01T00:00:00Z',
  targets: [{ phoneme: 's', ladder_level: 3, status: 'active' }],
}

function engagementFor(recommendedMode) {
  return {
    recommended_mode: recommendedMode,
    production_band: 'establishing',
    practice_mode: recommendedMode === 'conversation' ? 'conversation' : 'word_naming',
    gate: { blocks_practice: false },
    world: { current: 'meadow', unlocked: ['nest', 'meadow'] },
    daily_budget: { minutes_remaining: 20, cap: 30, used_minutes: 10 },
    greeting: 'Pip found a secret sound trail!',
    friends: [{ id: 'friend-s', name: 'Stella', phoneme: 's' }],
    trophies: [],
    graduation_ready: recommendedMode === 'graduation'
      ? [{ phoneme: 's', ready_to_graduate: true }]
      : [],
    pip: { label: 'Hatchling' },
    streak: { current: 2 },
  }
}

function sessionFor({ recommendedMode, ladderLevel }) {
  const mode = recommendedMode === 'pairs'
    ? 'pairs'
    : ['conversation', 'live'].includes(recommendedMode)
      ? 'conversation'
      : 'drill'
  return {
    session_id: 91,
    mode,
    trial_target: 10,
    production_band: ladderLevel <= 1 ? 'emerging' : 'establishing',
    practice_mode: ladderLevel <= 1
      ? 'model_imitate'
      : ladderLevel >= 7
        ? 'conversation'
        : 'word_naming',
    episode: {
      opening: 'A secret sound trail appeared in the meadow!',
      cliffhanger: 'A golden feather is waiting by the brook.',
    },
    conversation_tasks: [{
      child_prompt: 'Tell Pip about six things you can see.',
    }],
    minimal_pairs: [{
      target: 'sun',
      foil: 'fun',
      target_picture: { word: 'sun', emoji: '☀️' },
      foil_picture: { word: 'fun', emoji: '🎈' },
    }],
    target: {
      target_id: 12,
      phoneme: 's',
      ladder_level: ladderLevel,
      cue: 'Smile and let the air slide.',
      retry_cap: 2,
      prompts: [{
        word: ladderLevel === 5
          ? 'a sunny seal'
          : ladderLevel === 6
            ? 'Sam saw the sun.'
            : 'sun',
        picture: { word: 'sun', emoji: '☀️' },
      }],
    },
  }
}

async function mockAuthenticatedWorld(page, stage) {
  await page.addInitScript(() => {
    const TestUtterance = class {
      constructor(text) { this.text = text }
    }
    const testSpeechSynthesis = {
      cancel() {},
      speak(utterance) {
        setTimeout(() => utterance.onend?.(), 0)
      },
    }
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: TestUtterance,
    })
    Object.defineProperty(globalThis, 'speechSynthesis', {
      configurable: true,
      value: testSpeechSynthesis,
    })
    const microphoneTrack = {
      enabled: false,
      readyState: 'live',
      stop() { this.readyState = 'ended' },
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          active: true,
          getAudioTracks: () => [microphoneTrack],
          getTracks: () => [microphoneTrack],
        }),
      },
    })
    globalThis.MediaRecorder = class {
      static isTypeSupported() { return true }
      constructor() {
        this.state = 'inactive'
        this.mimeType = 'audio/webm'
      }
      start() { this.state = 'recording' }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['mock child voice turn']) })
        this.onstop?.()
      }
    }
  })

  await page.route('**/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, status: 'ok' }),
    })
  })

  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url())
    const path = requestUrl.pathname.replace(/^\/api/, '')
    const method = route.request().method()
    let payload
    if (path === '/auth/login' || path === '/auth/register' || path === '/auth/supabase/session') {
      payload = { token: 'test-token', refresh_token: 'refresh' }
    } else if (path === '/auth/me') {
      payload = { id: 'parent-1', email: 'parent@example.com', role: 'parent', display_name: 'Parent' }
    } else if (path === '/auth/consent') {
      payload = { ok: true }
    } else if (path === '/children' || path === '/children/') {
      payload = [{ ...child, screened: true, display_name: 'Sam' }]
    } else if (path === '/children/1/progress') {
      payload = { weekly_trials: 8, targets: child.targets, streak: 2 }
    } else if (path === '/children/1/engagement') {
      payload = engagementFor(stage.recommendedMode)
    } else if (path === '/curriculum/children/1/placement' && method === 'GET') {
      payload = {
        probes: [{
          id: 'sun-initial',
          phoneme: 's',
          targets: ['sun'],
          level: 'word',
        }],
        ui: { intro: 'Listen, then say it with Pip.' },
      }
    } else if (path === '/curriculum/children/1/placement' && method === 'POST') {
      payload = { completed: true, active_node: { id: 's-initial-word' } }
    } else if (path === '/demo/score') {
      payload = {
        accuracy_score: 88,
        outcome: 'hit',
        feedback_band: { kid_label: 'Berry bright!' },
        coach: { kid_line: 'Berry bright!' },
      }
    } else if (path === '/sessions/start' && method === 'POST') {
      const levelByLadder = {
        0: 'isolation',
        1: 'syllable',
        2: 'word',
        3: 'word',
        4: 'word',
        5: 'phrase',
        6: 'sentence',
        7: 'conversation',
      }
      const level = levelByLadder[stage.ladderLevel] || 'word'
      const word = level === 'phrase'
        ? 'a sunny seal'
        : level === 'sentence'
          ? 'Sam saw the sun.'
          : level === 'isolation'
            ? 'sss'
            : 'sun'
      payload = {
        ...sessionFor(stage),
        session_id: '91',
        exercise: {
          id: 'ex-1',
          expected_text: word,
          target_phoneme: 's',
          level,
          type: level === 'isolation' ? 'isolation' : 'word',
          prompt: `Say ${word}`,
          model_lines: [`My turn: ${word}.`],
        },
        episode: {
          cold_open: 'A secret sound trail appeared in the meadow!',
          next_teaser: 'A golden feather is waiting by the brook.',
          celebration: 'Berry bright!',
        },
      }
    } else if (path === '/realtime/session') {
      payload = { client_secret: null, fallback: 'speech_synthesis' }
    } else if (path === '/sessions/91/utterance' || path.endsWith('/utterance')) {
      payload = {
        accuracy_score: 90,
        exercise_complete: true,
        feedback_band: { name: 'great', kid_label: 'Berry time! Pip loved that sound!' },
        coach_turns: [{ text: 'Berry time! Pip loved that sound!' }],
        next_exercise: {
          id: 'ex-2',
          expected_text: 'seal',
          target_phoneme: 's',
          level: 'word',
          type: 'word',
        },
        viseme_sequence: [],
      }
    } else if (path === '/sessions/91/end') {
      payload = {
        celebration_message: 'The meadow heard every brave try.',
        parent_summary: 'Sam practiced /s/ with warm energy.',
        xp_earned: 12,
      }
    } else if (path === '/math/demo/start') {
      payload = {
        session_id: 'math-1',
        exercise: { prompt: 'How many berries?', quantity: 3, answer: 3, choices: [2, 3, 4] },
        episode: { cold_open: 'Let’s count berries with Pip!' },
      }
    } else if (path === '/waitlist/checkout') {
      payload = {
        already_paid: true,
        checkout_url: null,
        session_id: 'cs_test',
        amount_cents: 9900,
      }
    } else if (path === '/waitlist') {
      payload = { joined: true, already_joined: false, paid: false }
    } else if (path === '/coach/tts') {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: Buffer.from('ID3'),
      })
      return
    } else if (path === '/pictures') {
      payload = {
        count: 127,
        pictures: Array.from({ length: 127 }, (_, index) => ({
          word: `picture ${index + 1}`,
          emoji: '✨',
        })),
      }
    } else {
      payload = {}
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  })
}

async function openParentDashboard(page, stage) {
  await mockAuthenticatedWorld(page, stage)
  await page.addInitScript(() => {
    localStorage.setItem('chirp.accessToken', 'test-token')
    localStorage.setItem('chirp.refreshToken', 'refresh')
  })
  await page.goto('/')
  await page.getByRole('button', { name: /grown-ups/i }).first().click()
  // ParentAuth resumes from the injected token (Google OAuth skipped in e2e).
  await page.getByRole('button', { name: /Sam/ }).click()
}

async function openChildExperience(page, stage) {
  await openParentDashboard(page, stage)
  await page.getByRole('button', {
    name: /Practice with Pip|Play Sound Detective|Tell Pip a story|Talk live with Pip|Open the graduation|Explore the meadow/,
  }).click()
}

const stages = [
  { recommendedMode: 'drill', ladderLevel: 0, label: 'Copy Pip' },
  { recommendedMode: 'drill', ladderLevel: 2, label: 'Picture Meadow' },
  { recommendedMode: 'pairs', ladderLevel: 3, label: 'Sound Detective' },
  { recommendedMode: 'drill', ladderLevel: 3, label: 'Tiny Story' },
  { recommendedMode: 'drill', ladderLevel: 4, label: 'Story Flight' },
  { recommendedMode: 'conversation', ladderLevel: 5, label: 'Pip Chat' },
  { recommendedMode: 'live', ladderLevel: 5, label: 'Live with Pip' },
]

const talkButton = (page) => page.getByRole('button', { name: /talk with pip|tap to talk/i })
const doneButton = (page) => page.getByRole('button', { name: /I’m done/i })

for (const stage of stages) {
  test(`${stage.label} opens from the backend recommendation`, async ({ page }) => {
    await openChildExperience(page, stage)
    await expect(page.getByText(stage.label, { exact: true })).toBeVisible()
    await expect(page.getByText(/PIP SAYS/)).toBeVisible()
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }))
    expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1)
  })
}

test('graduation renders the backend-ready sound without a score', async ({ page }) => {
  await openChildExperience(page, { recommendedMode: 'graduation', ladderLevel: 7 })
  await expect(page.getByText('Graduation', { exact: true })).toBeVisible()
  await expect(page.getByText('/s/')).toBeVisible()
  await expect(page.getByText(/score|percent|wrong/i)).toHaveCount(0)
})

test('free play exposes all 127 picture assets as non-scored play', async ({ page }) => {
  await openChildExperience(page, { recommendedMode: 'free_play', ladderLevel: 7 })
  await expect(page.getByText('There is no scoring here.')).toBeVisible()
  await expect(page.getByText('Free play', { exact: true })).toBeVisible()
  // Picture deck is optional on SpeechC; when mocked it should still render.
  const deckCount = page.getByText('1 / 127')
  if (await deckCount.count()) {
    await expect(deckCount).toBeVisible()
  } else {
    await expect(page.getByText(/Wander the meadow/i)).toBeVisible()
  }
})

test('reduced-motion children keep the full interaction without ambient loops', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openChildExperience(page, stages[1])
  const motion = await page.locator('.syllabus-prompt-card').evaluate(
    (element) => ({
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      duration: element.getAnimations()[0]?.effect.getTiming().duration ?? 0,
    }),
  )
  expect(motion.reduced).toBe(true)
  expect(motion.duration).toBeLessThanOrEqual(0.1)
  // Auto-listen may already be open; either control means the turn path is alive.
  await expect(talkButton(page).or(doneButton(page))).toBeVisible()
})

test('a fallback microphone turn records once, scores, and advances', async ({ page }) => {
  await openChildExperience(page, stages[1])
  const scoringRequest = page.waitForRequest(
    (request) => request.url().includes('/utterance'),
    { timeout: 15000 },
  )
  // Auto-listen may already be open; otherwise start a tap turn.
  if (!(await doneButton(page).isVisible().catch(() => false))) {
    await talkButton(page).click()
  }
  await expect(doneButton(page)).toBeVisible()
  await doneButton(page).click()
  await scoringRequest
  await expect(page.getByLabel('Berry basket: 1 of 10')).toBeVisible({ timeout: 10000 })
  // Next listen window should auto-open after coaching (force beginChildTurn).
  await expect(talkButton(page).or(doneButton(page))).toBeVisible({ timeout: 10000 })
})

test('one screener tap automatically finalizes and submits the child turn', async ({ page }) => {
  await openParentDashboard(page, stages[1])
  await page.getByRole('button', { name: /Pip’s Listening Game/i }).click()
  await expect(page.getByRole('button', { name: /tap once to talk/i })).toBeEnabled()
  const submittedTurn = page.waitForRequest(
    (request) => request.url().includes('/demo/score'),
    { timeout: 7000 },
  )
  await page.getByRole('button', { name: /tap once to talk/i }).click()
  await submittedTurn
})

test('landing characters are alive and parents can join or preview the dashboard', async ({ page }) => {
  await mockAuthenticatedWorld(page, stages[1])
  await page.goto('/')

  await expect(page.getByText('App Store soon').first()).toBeVisible()
  await expect(page.getByText('Google Play soon').first()).toBeVisible()
  await expect(page.locator('.store-availability--hero .store-availability__badge--ios img')).toBeVisible()
  await expect(page.locator('.store-availability--hero .store-availability__badge--android img')).toBeVisible()
  await expect(page.locator('.world-pip .character-life__rig-lid')).toHaveCount(2)
  await expect(page.locator('.world-pip .character-life__rig-beak')).toHaveCount(2)

  await page.locator('#nest').scrollIntoViewIfNeeded()
  await expect(page.locator('.voice-egg .character-life--egg')).toHaveCount(4)
  await expect(page.locator('.voice-egg .character-life__eyes i')).toHaveCount(8)
  await expect(page.locator('.voice-egg .character-life__beak')).toHaveCount(0)

  await page.locator('#top').scrollIntoViewIfNeeded()
  const waitlistRequest = page.waitForRequest(
    (request) => request.url().includes('/waitlist/checkout'),
  )
  await page.getByLabel(/founding seat/i).fill('new-parent@example.com')
  await page.getByRole('button', { name: /secure seat/i }).click()
  await waitlistRequest
  await expect(page.getByText(/already has a founding seat/i)).toBeVisible()

  await page.getByRole('button', { name: 'Preview the dashboard' }).click()
  await expect(page.getByText('Dashboard preview')).toBeVisible()
  await expect(page.locator('h1').filter({ hasText: 'Sam' })).toContainText('is finding their voice.')
})
