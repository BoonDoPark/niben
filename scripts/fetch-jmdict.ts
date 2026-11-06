import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * jmdict-simplified 최신 릴리스에서 영어 common 판을 내려받아 data/ 에 푼다.
 *
 * common 판을 쓰는 이유: 전체 판은 20만 엔트리가 넘는데 고어와 전문용어가 대부분이라
 * 학습용으로는 노이즈다. common 판은 2만 남짓이고 실제로 쓰이는 단어만 들어 있다.
 *
 * 라이선스: JMdict는 CC BY-SA 4.0 (EDRDG). 앱에 출처 표기가 필요하다.
 */

const RELEASE_API = 'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest'
const ASSET_PREFIX = 'jmdict-eng-common-'
const ASSET_SUFFIX = '.json.tgz'
const DATA_DIR = join(process.cwd(), 'data')

type ReleaseAsset = { name: string; browser_download_url: string; size: number }
type Release = { tag_name: string; assets: ReleaseAsset[] }

async function main() {
  mkdirSync(DATA_DIR, { recursive: true })

  console.log('최신 릴리스 확인 중...')
  const res = await fetch(RELEASE_API, { headers: { accept: 'application/vnd.github+json' } })
  if (!res.ok) {
    throw new Error(`릴리스 정보를 가져오지 못했습니다: ${res.status} ${res.statusText}`)
  }
  const release = (await res.json()) as Release

  const asset = release.assets.find(
    (a) => a.name.startsWith(ASSET_PREFIX) && a.name.endsWith(ASSET_SUFFIX),
  )
  if (!asset) {
    throw new Error(`${ASSET_PREFIX}*${ASSET_SUFFIX} 자산을 찾지 못했습니다 (${release.tag_name})`)
  }

  console.log(`  ${release.tag_name} / ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`)

  // 이전 판이 남아 있으면 지운다. 두 판이 섞이면 임포트가 어느 쪽을 읽었는지 알 수 없다.
  for (const f of readdirSync(DATA_DIR)) {
    if (f.startsWith(ASSET_PREFIX) && f.endsWith('.json')) {
      rmSync(join(DATA_DIR, f))
      console.log(`  이전 판 제거: ${f}`)
    }
  }

  console.log('내려받는 중...')
  const download = await fetch(asset.browser_download_url)
  if (!download.ok) {
    throw new Error(`다운로드 실패: ${download.status} ${download.statusText}`)
  }

  const archivePath = join(DATA_DIR, asset.name)
  writeFileSync(archivePath, Buffer.from(await download.arrayBuffer()))

  // Node에 tar 해제 기능이 없어서 시스템 tar를 쓴다 (macOS/Linux 기본 탑재).
  execFileSync('tar', ['xzf', archivePath, '-C', DATA_DIR])
  rmSync(archivePath)

  const extracted = readdirSync(DATA_DIR).find(
    (f) => f.startsWith(ASSET_PREFIX) && f.endsWith('.json'),
  )
  if (!extracted || !existsSync(join(DATA_DIR, extracted))) {
    throw new Error('압축은 풀렸지만 JSON 파일을 찾지 못했습니다')
  }

  console.log(`\n완료: data/${extracted}`)
  console.log('다음: npm run data:import')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
