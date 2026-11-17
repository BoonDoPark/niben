import { CheckRequestSchema, gradeAnswer, GradingError } from '@/lib/grading'

/**
 * POST /api/check — 학습자 답 채점. 본문은 CheckRequest(src/lib/grading.ts), 응답은 CheckResult.
 *
 * 로그인이 없는 공개 사이트라 누구나 부를 수 있다. Gemini 한도·요금을 지키려고
 * 다른 사이트에서 오는 요청을 막고, IP마다 요청 수를 제한하고, 본문 크기를 제한한다.
 *
 * IP 제한은 서버 인스턴스 메모리에 둔다. 서버리스 인스턴스끼리 공유되지 않으므로 완전한 제한은 아니다.
 * 트래픽이 늘면 Vercel 방화벽 규칙이나 공유 저장소(Upstash 등)로 옮긴다.
 */

export const maxDuration = 40

const WINDOW_MS = 10 * 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 30
const MAX_BODY_BYTES = 4 * 1024

const recent = new Map<string, number[]>()

function rateLimited(ip: string, now: number): boolean {
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (hits.length >= MAX_REQUESTS_PER_WINDOW) {
    recent.set(ip, hits)
    return true
  }
  hits.push(now)
  recent.set(ip, hits)
  // 오래된 IP가 쌓이지 않게 가끔 비운다.
  if (recent.size > 5000) {
    for (const [key, times] of recent) if (times.every((t) => now - t >= WINDOW_MS)) recent.delete(key)
  }
  return false
}

function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

/** 다른 사이트의 페이지에서 보낸 요청을 막는다. Origin 이 없는 요청(서버, curl)은 IP 제한만 받는다. */
function crossSite(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).host !== new URL(request.url).host
  } catch {
    return true
  }
}

const error = (code: string, status: number) => Response.json({ error: code }, { status })

export async function POST(request: Request) {
  if (crossSite(request)) return error('forbidden', 403)
  if (rateLimited(clientIp(request), Date.now())) return error('rate_limited', 429)

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return error('too_large', 413)

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return error('bad_request', 400)
  }
  const parsed = CheckRequestSchema.safeParse(body)
  if (!parsed.success) return error('bad_request', 400)

  try {
    return Response.json(await gradeAnswer(parsed.data))
  } catch (err) {
    if (err instanceof GradingError) {
      if (err.code === 'not_configured') return error('not_configured', 503)
      console.error('[api/check]', err.code, err.message)
      if (err.code === 'busy') return error('busy', 503)
      if (err.code === 'quota') return error('quota', 429)
    } else {
      console.error('[api/check]', err)
    }
    return error('failed', 502)
  }
}
