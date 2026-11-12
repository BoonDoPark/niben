# niben

Repository which means to study Japanese easily through this app

일본어 단어를 한국어 뜻으로 학습하는 반응형 웹앱(영어·라틴어 화면도 있다). 로그인 없이 누구나 바로 쓸 수 있다.

## 구조

```
PostgreSQL          →  정적 JSON 청크  →  브라우저
(단어 작성/검수)        (빌드 시 추출)      + IndexedDB(학습 진도)
```

DB는 런타임 조회용이 아니라 **사전 데이터를 작성하고 검수하는 곳**이다.
앱에 나가는 데이터는 빌드 시점에 정적 JSON으로 뽑히므로 런타임에는 서버 의존성이 없다.
학습 진도는 서버에 저장하지 않고 브라우저에만 존재한다.

## 스택

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Drizzle ORM + PostgreSQL ([Neon](https://neon.tech))

드라이버는 표준 TCP(`postgres.js`)를 쓴다. Neon 전용 드라이버 대신 이걸 고른 이유는
`DATABASE_URL`만 바꾸면 다른 PostgreSQL로 옮길 수 있게 하기 위해서다.

## 시작하기

```bash
npm install
cp .env.example .env     # Neon 콘솔에서 연결 문자열 복사해 넣기
npm run db:migrate       # 스키마 적용
npm run dev
```

로컬 PostgreSQL로 대신하려면:

```bash
docker run --name niben-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:17
docker exec -it niben-db createdb -U postgres niben
```

## DB 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run db:generate` | 스키마 변경 → 마이그레이션 SQL 생성 |
| `npm run db:migrate` | 마이그레이션을 DB에 적용 |
| `npm run db:push` | 마이그레이션 없이 스키마 직접 반영 (초기 실험용) |
| `npm run db:studio` | Drizzle Studio — 단어 편집용 관리자 UI |
| `npm run data:fetch` | jmdict-simplified 최신 판을 `data/` 에 내려받기 |
| `npm run data:import` | 내려받은 JMdict를 DB에 적재 |
| `npm run data:freq` | JMdict 원본 XML에서 신문 빈도 순위(`freq_rank`) 채우기 |
| `npm run data:usage` | jiten.moe 빈도 목록에서 실사용 빈도 순위(`usage_rank`, 학습 순서 1차 기준) 채우기 |
| `npm run translate` | 한국어·라틴어 뜻 생성 (`--lang`, Gemini API 또는 `--dump`/`--load`) |
| `npm run examples` | 예문 생성 (`--dump`/`--load`, 상위 2,000단어의 앞쪽 뜻 2개까지) |
| `npm run data:local` | DB 없이 로컬 JMdict에서 앱용 `public/data/words.json` 생성 |
| `npm run data:export` | DB에서 앱용 `public/data/words.json`(전체), `study.json`(학습 순서 상위 2,000단어), `examples.json`(예문) 생성 |

화면은 두 개다. 메인(`/ko`)은 `study.json`에서 화면 언어의 뜻이 있는 단어 50개를 무작위로 뽑아 보여 주고
("다시 뽑기"로 새로 뽑는다), 전체 단어 탭(`/ko/words`)은 `words.json` 전체를 검색·품사별로 거른다.

### 예문과 연습

두 화면 모두 단어 머리(표제어 줄)를 누르면 예문·연습 패널이 열린다([src/components/word-study.tsx](src/components/word-study.tsx)).

- **예문**: 일본어 원문과 가나 읽기. "뜻 보기"를 누르면 화면 언어로 된 번역이 나온다.
  예문 파일(`public/data/examples.json`)은 처음 단어를 펼칠 때 한 번만 받는다.
- **해석 채점**: 예문마다 화면 언어로 뜻을 써서 채점받는다. 채점하면 모범 번역도 보여준다.
- **작문 채점**: 그 단어를 넣어 일본어 문장을 직접 써서 채점받는다. 예문이 없는 단어도 할 수 있다.

채점은 `POST /api/check`([src/app/api/check/route.ts](src/app/api/check/route.ts))가 Gemini로 한다.
프롬프트와 응답 형식은 [src/lib/grading.ts](src/lib/grading.ts)에 있고, 피드백은 화면 언어(한국어·영어·라틴어)로 온다.
API 키는 서버에서만 읽는다(브라우저에서 Gemini를 직접 부르면 키가 그대로 드러난다).

- 로그인이 없는 공개 사이트라, 다른 사이트에서 오는 요청을 막고 IP마다 10분에 30번으로 제한한다.
  제한은 서버 인스턴스 메모리에 두므로 완전하지 않다. 트래픽이 늘면 Vercel 방화벽 규칙이나 공유 저장소로 옮긴다.
- 기본 모델은 `gemini-3.5-flash-lite`(환경 변수 `GEMINI_MODEL`로 바꾼다). `gemini-3.8-flash`는 응답이 수십 초~수 분 걸려 화면에서 쓰기 어려웠다.
  SDK의 자동 재시도(최대 5번, 최대 60초 간격)를 끄고 30초에서 끊는다.
- `GEMINI_API_KEY`가 없으면 채점 버튼을 눌렀을 때 "채점 기능을 쓸 수 없음"이 나온다. 예문 보기는 키 없이도 된다.

### 다국어

화면은 한국어·영어·라틴어로 볼 수 있고, 주소로 나뉜다(`/ko`, `/en`, `/la`). 오른쪽 위 메뉴로 바꾼다.
언어 없는 주소(`/`, `/words`)로 들어오면 [src/proxy.ts](src/proxy.ts)가 언어 주소로 보낸다.
고른 언어(쿠키 `NEXT_LOCALE`) → 브라우저 언어(`Accept-Language`) → 한국어 순으로 정한다.

| 화면 | 문구 | 뜻 |
| --- | --- | --- |
| `/ko` | 한국어 | 한국어 (번역 안 된 뜻만 영어) |
| `/en` | 영어 | 영어 |
| `/la` | 라틴어 | 라틴어 (번역 안 된 뜻만 영어) |

뜻마다 한 언어로만 보여준다. 검색은 화면에 안 보이는 영어 뜻으로도 된다(`eat` → 食べる).

- 언어 목록과 화면별 뜻 언어: [src/i18n/config.ts](src/i18n/config.ts)
- 화면 문구: [src/i18n/dictionaries/](src/i18n/dictionaries/) — `ko.ts`가 기준 모양이고 다른 언어는 같은 모양이어야 한다(타입 검사가 잡는다).
  서버에서만 읽고, 페이지가 필요한 문구를 클라이언트 컴포넌트에 넘긴다.
- 언어를 늘리려면 `LOCALES`·`LOCALE_NAMES`·`MEANING_LANGUAGES`에 추가하고 사전 파일을 하나 더 만든다.
  Intl에 데이터가 없는 언어(라틴어)는 `numberLocale`에서 숫자 표기용 언어를 따로 정한다.

한 글자 히라가나 표제어(`の`, `は`, `を` …)의 뜻 중 한국어로 조사·어미에 해당하는 것(~의, ~은/는, ~을/를 …)은
두 화면 모두에서 뺀다. 단어장에서 따로 익힐 말이 아니어서다. 단어로서의 뜻(`ね` = 저기, `で` = 그래서)은 남기고,
남는 뜻이 없으면 단어가 빠진다. DB에는 그대로 있고 앱용 JSON을 만들 때만 거른다([scripts/lib/app-filter.ts](scripts/lib/app-filter.ts)).
`のに`, `には`처럼 다른 글자와 이어진 표제어는 건드리지 않는다.

### DB 없이 화면 보기

```bash
npm run data:fetch     # data/ 가 비어 있을 때만
npm run data:local     # public/data/words.json (빈도순 2.2만 단어, 영어 뜻)
npm run dev
```

표제어 선택·병합·빈도 환산은 `data:import`·`data:freq`와 같은 코드([scripts/lib/jmdict-source.ts](scripts/lib/jmdict-source.ts))를
쓰므로 DB에 들어가는 것과 같은 단어가 나온다. 한국어 뜻은 DB에만 생기므로 이 경로의 뜻은 영어다.
그래서 한국어 화면의 메인(무작위 50단어)은 비고, 영어 화면(`/en`)에서는 메인과 전체 단어 탭을 모두 쓸 수 있다.

### 데이터 적재

```bash
npm run data:fetch     # 최신 JMdict (영어 common 판, 약 2.2만 엔트리)
npm run data:import    # words + senses + sense_translations(en) 채우기
npm run data:freq      # words.freq_rank 채우기 (원본 XML을 따로 받는다)
npm run data:usage     # words.usage_rank 채우기 (jiten.moe 빈도 목록을 data/jiten 에 받는다)
```

### 뜻 생성 (한국어·라틴어)

```bash
npm run translate -- --limit 20 --dry-run             # 프롬프트만 출력 (API 호출 없음)
npm run translate -- --limit 2000                     # 학습 순서 상위 2000 표제어 중 한국어 뜻이 없는 것
npm run translate -- --lang la --limit 20 --dry-run   # 라틴어
```

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `--lang` | ko | 만들 뜻 언어 (`ko` \| `la`). `--dump`와 `--load`에 똑같이 넘긴다 |
| `--limit` | 200 | 처리할 표제어 수. 그 언어 뜻이 없는 표제어를 학습 순서([src/db/order.ts](src/db/order.ts))대로 고른다 |
| `--batch` | 10 | 요청 하나에 담을 표제어 수 |
| `--concurrency` | 4 | 동시 요청 수 |
| `--dry-run` | — | 프롬프트만 출력하고 종료 |
| `--dump <디렉터리>` | — | 요청 본문을 파일로 쓰고 종료 (API 없이 다른 도구로 번역할 때) |
| `--load <경로>` | — | 번역 결과 JSON(파일 또는 디렉터리)을 검증해 넣고 종료 |

그 언어 뜻이 이미 있는 뜻은 건너뛴다. 중간에 끊겨도 다시 실행하면 이어지고,
손으로 고친 뜻은 덮이지 않는다. 실행이 끝나면 실제 토큰 사용량과 추정 비용을 출력한다.
번역한 뒤에는 `npm run data:export`를 다시 돌려야 화면에 반영된다.

현재 상태: 앱에 나오는 22,576단어, 뜻 36,855개에 모두 한국어 뜻과 라틴어 뜻이 있다.
`--dump`로 뽑은 요청을 Claude가 직접 번역해 `--load`로 넣었다. 모두 `source='llm'`, `verified=false`(미검수)다.

`GEMINI_API_KEY`가 필요하다([Google AI Studio](https://aistudio.google.com/apikey)에서 발급, 무료 등급 있음).
모델은 [src/lib/translation.ts](src/lib/translation.ts)의 `TRANSLATION_MODEL`이다.
임포트와 분리한 이유는 임포트가 몇 번이든 재실행 가능해야 하는데
번역은 비용이 들기 때문이다 — 한 스크립트에 묶으면 임포트를 다시 돌릴 때마다 번역비가 나간다.

**프롬프트는 [src/lib/translation.ts](src/lib/translation.ts)에 있다.** 번역 품질이 이 프로젝트의 전부이므로
스크립트에서 분리해 뒀다. 고친 뒤 `--dry-run`으로 확인하고 소량으로 실행해보는 흐름을 의도했다.

적재 결과는 표제어 22,587개 / 뜻 36,953개 / 영어 뜻 36,953개다.
그중 7,549개가 활용 대상(`conjugation_class`가 있는 단어)이다.

임포트는 **멱등**하다. 이미 들어간 JMdict 엔트리는 `jmdict_seq`로 걸러내므로
다시 돌려도 손으로 고친 내용이 덮이지 않는다.
한국어 번역은 여기서 만들지 않는다 — 임포트는 몇 번이든 재실행할 수 있어야 하는데
번역은 비용이 들기 때문에, 섞어두면 재실행할 때마다 번역비가 나간다.

### 예문 생성

```bash
npm run examples -- --dump <디렉터리>   # 예문이 없는 뜻을 묶음 파일로 뽑기 (system-prompt.txt + batch-NNN.txt)
npm run examples -- --load <디렉터리>   # batch-NNN.json 을 검증해 examples·example_translations 에 넣기
```

대상은 앱에 나오는 학습 순서 상위 2,000단어의 앞쪽 뜻 2개까지다(앱과 같은 뜻 거르기를 쓴다).
예문마다 일본어 원문·가나 읽기와 한국어·영어·라틴어 번역을 만든다. 이미 예문이 있는 뜻은 뽑지도 넣지도 않는다.
현재 예문은 `--dump`로 뽑은 요청을 Claude가 직접 써서 넣었다(`source='llm'`, 미검수).

## 배포

사이트: https://niben.vercel.app (Vercel 프로젝트 `niben`)

```bash
npm run data:export      # public/data 를 최신 DB 내용으로 다시 만든다
vercel deploy --prod     # 이 컴퓨터의 파일을 그대로 올려 빌드한다
```

앱용 사전 JSON(`public/data`)은 git에 없어서 GitHub 연동 자동 배포로는 데이터가 빠진다.
그래서 로컬에서 Vercel CLI로 올린다. CLI는 `.gitignore`를 보지 않고 [.vercelignore](.vercelignore)만 보므로,
`.env`와 원본 데이터(`data/`)는 그 파일에서 뺀다. DB는 빌드에도 런타임에도 쓰지 않는다.

채점 API에는 Vercel 환경 변수 `GEMINI_API_KEY`(선택: `GEMINI_MODEL`)가 필요하다. 없으면 채점만 꺼지고 나머지는 그대로 동작한다.

## 스키마

[src/db/schema.ts](src/db/schema.ts) 참고. 사전 데이터만 다루며 사용자 테이블은 없다.

| 테이블 | 역할 |
| --- | --- |
| `words` | 표제어. `(lemma, reading)`이 유니크 — 표기가 같아도 읽기가 다르면 다른 단어 |
| `senses` | 뜻. 언어 중립이며 JMdict의 sense 하나에 대응 |
| `sense_translations` | 뜻의 언어별 번역. `(sense_id, lang)`이 유니크 |
| `examples` | 예문의 일본어 원문. 단어가 아니라 특정 뜻에 붙는다 |
| `example_translations` | 예문의 언어별 번역 |
| `tags` / `word_tags` | JLPT 외 분류 (교재별, 주제별) |

모든 데이터 테이블에 `source`(출처)와 `verified`(검수 여부)가 있다.
재임포트할 때 직접 손댄 데이터를 지키고, 미검수 항목만 골라내기 위한 것이다.

### 다국어

뜻과 예문은 언어를 데이터 차원으로 분리한다. JMdict의 영어 gloss를 `lang='en'`으로
그대로 보관하고 한국어를 그 옆에 두기 때문에, 번역을 원본과 대조해 검수할 수 있고
번역 방식을 개선해 재번역해도 원본이 남는다. 언어 추가는 데이터 추가로 끝난다.

검수 플래그가 두 곳에 있는데 역할이 다르다.

- `senses.verified` — 이 뜻을 앱에 실을지 검토했는가 (JMdict에는 고어·전문용어가 섞여 있다)
- `sense_translations.verified` — 이 언어 번역이 맞는가 (실제 검수의 기준)

### 활용

`words.conjugation_class`가 활용형 자동 생성기의 분기 기준이다. `pos`와 따로 두는 이유는
목적이 다르기 때문이다 — `pos`는 화면 표시·필터링용이고, 활용 클래스는 규칙 분기용이다.
같은 5단동사라도 `行く`(て형이 `行って`), `ある`(부정형이 `ない`)처럼 예외가 있어서
둘이 1:1로 대응되지 않는다.

각 값은 JMdict 품사 태그와 대응하므로 임포트 시 자동으로 채울 수 있다
(`v5k-s` → `godan_iku`, `v5r-i` → `godan_aru`, `adj-ix` → `adj_i_ii` 등).
매핑은 [src/db/schema.ts](src/db/schema.ts)의 `conjugationClass` 정의에 주석으로 적어두었다.

## 데이터 소스

| 항목 | 소스 | 라이선스 |
| --- | --- | --- |
| 표제어·품사·활용 클래스·신문 빈도 | [JMdict](https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html) ([JSON 변환본](https://github.com/scriptin/jmdict-simplified)) | CC BY-SA 4.0 |
| 학습 순서(실사용 빈도) | [jiten.moe 빈도 목록](https://jiten.moe/frequency-dictionaries) (전체 매체) | CC BY-SA 4.0 |
| 악센트 | [kanjium](https://github.com/mifunetoshiro/kanjium) | CC BY-SA 4.0 |
| 예문 | [Tatoeba](https://tatoeba.org/en/downloads) | CC BY 2.0 FR |
| 한국어 뜻 | JMdict 영어 gloss + 일본어 표제어에서 번역 후 직접 검수 | — |
| 라틴어 뜻 | JMdict 영어 gloss + 일본어 표제어에서 생성 (미검수) | — |

JMdict에 한국어 gloss는 없다. 영어 gloss만 번역하면 2단계 손실이 생기므로,
**일본어 표제어를 함께 넘겨** 한자어 직결 대응을 살리고 영어는 의미 구분용으로만 쓴다.
(`微妙` → 영어만 보면 "섬세한/어려운", 일본어를 같이 보면 "미묘하다")

라틴어는 일본어와 공유하는 한자어가 없어 영어 gloss가 뜻을 고르는 주된 근거가 되지만, 영어 낱말을 하나씩 옮기지 않고
일본어가 가리키는 뜻을 라틴어로 다시 쓴다. 고전 어휘를 먼저 쓰고, 현대 문물은 자리 잡은 신(新)라틴어
(`computatrum`, `telephonum`)만 쓴다. 장음 기호는 쓰지 않는다. 규칙은 [src/lib/translation.ts](src/lib/translation.ts)의 라틴어 프롬프트에 있다.

번역은 표제어 단위로 묶어 보낸다. 뜻을 하나씩 따로 보내면 모델이 "이 표제어의 다른 뜻과
겹치지 않게 쓰라"는 판단을 할 수 없기 때문이다. 뜻이 여러 개인 단어에서 차이가 크다.

생성된 뜻은 `source='llm'`, `verified=false`로 들어간다. 검수는 앱을 쓰면서 점진적으로 한다.

학습 순서는 `jlpt_level`이 아니라 빈도로 잡는다. JLPT는 2010년 이후 공식 어휘 목록이 없어
시중 목록이 전부 추정치이기 때문이다. 순서는 [src/db/order.ts](src/db/order.ts) 한 곳에서 정한다.

1. **`usage_rank` (실사용 빈도)** — 1차 기준
2. **`freq_rank` (신문 빈도)** — `usage_rank`가 없는 단어끼리
3. `jmdict_seq` — 동률 고정

### 실사용 빈도 (`usage_rank`)

처음에는 JMdict의 신문 빈도(`freq_rank`)만 썼는데, 상위 2,000단어가 명사 1,789개, 동사 21개였다.
신문 기사라 한자 명사가 위를 차지하고, `食べる`가 1만 4천 번째, `分かる`가 1만 6천 번째였다.
학습 순서로 쓸 수 없어서 [jiten.moe](https://jiten.moe/frequency-dictionaries)의 전체 매체 빈도 목록으로 바꿨다.
애니·드라마·영화 자막, 소설, 만화, 게임 등 1만 8천여 편을 형태소 분석해 **활용형을 기본형으로 되돌린 뒤
JMdict 단어 단위로 센** 목록이라 동사가 제 순위를 받는다. 바꾼 뒤 상위 2,000단어는 명사 730, 동사 494,
형용사 280, 부사 110개다(`食べる` 173번째, `委員会` 6,460번째).

CSV는 `Word,Form,Rank`(표기, 읽기, 순위)다. 단어와 맞추는 규칙은 [scripts/lib/usage-rank.ts](scripts/lib/usage-rank.ts):

- 자기 표기 행(표제어, 읽기)의 순위를 쓴다.
- 가나 표기 행(읽기, 읽기)은 가나로 쓰이는 사용량이다(`凄い`보다 `すごい`가 훨씬 흔하다).
  같은 읽기의 단어 여럿이 한 행을 공유하므로(`ある`: `有る`·`或`) 읽기마다 한 단어에게만 준다 —
  가나로 쓰는 단어(첫 뜻에 `uk` 태그 또는 가나 표제어) 중 자기 표기 순위가 가장 좋은 단어.
  그런 단어가 없으면 그 읽기의 모든 단어 중에서 고른다(`綺麗` ← `きれい`).

### 신문 빈도 (`freq_rank`)

`freq_rank`는 `npm run data:freq`가 채운다. jmdict-simplified는 변환 과정에서
빈도 태그를 `common: boolean` 하나로 축약해버리므로, 이 스크립트만 EDRDG의
**원본 XML**을 따로 받아 `ke_pri`/`re_pri`를 파싱한다.

순위 환산은 두 갈래다.

- **`nfXX`가 있으면 정밀 순위** — 마이니치신문 코퍼스 빈도를 500단어 단위로 끊은 구간이다.
  구간 시작값을 쓴다(`nf01` → 1, `nf48` → 23501). 22,587개 중 15,147개가 여기 해당한다.
- **없으면 태그별 버킷** — 나머지 7,440개. 태그마다 출처와 성격이 달라 뭉뚱그리면 안 된다.

| 태그 | 값 | 근거 |
| --- | --- | --- |
| `ichi1` | 10000 | 기본어휘 1만어 수록 = 순위 10000 이하라는 주장. `人`, `行く` |
| `spec1` | 20000 | 편집자 판단 빈출 |
| `gai1` | 25000 | 흔한 외래어. `アンモニア`, `ヘルニア` |
| `*2` 계열 | 35000 | `news2`, `ichi2`, `spec2`, `gai2` |

`ichi1`을 10000으로 두면 순위 10000 이하가 확정된 `nf01`~`nf20` 뒤,
`nf21` 이후 앞에 놓여 논리적 모순이 없다.
버킷을 하나로 합치면 `人`·`行く`가 `曖昧`(nf35) 같은 희귀어보다 뒤로 밀려 학습 순서로 쓸 수 없다.

### 알려진 한계

- **동형이의어 병합** — 표기와 읽기가 같은 별개 엔트리는 한 표제어로 합친다.
  `コート`(외투/경기장), `ライト`(빛/오른쪽)처럼 가타카나 외래어에서 33건 발생한다.
  뜻은 모두 보존되지만 `jmdict_seq`는 첫 엔트리 것만 남는다.
- **명사 vs 부사** — JMdict는 시간·수량 명사에 `n`과 `adv`를 함께 붙인다(`水曜日`, `夕方`).
  명사를 우선하도록 했기 때문에 `段々`, `ひらひら` 같은 의태어 일부가 명사로 분류된다.
- **대표형만 저장** — 엔트리당 표제어 한 행만 만든다. `明日`의 `あす`/`みょうにち` 같은
  이독은 저장되지 않는다.
- **실사용 빈도의 성격** — 자막·소설 중심이라 구어가 강하다(`俺`, `やる`가 위에 있다).
  가나 표기 행을 한 단어에만 주는 규칙은 추정이라, 같은 읽기의 드문 단어가 순위를 잘못 받을 수 있다.
- **신문 빈도의 해상도** — `nf` 구간은 500단어 단위라 같은 구간 안에서는 순서가 없다.
  버킷 값(10000·20000·25000·35000)은 순위가 아니라 정렬용 자리표시자다. 지금은 보조 기준이다.

### 라이선스 의무

원본이 CC BY-SA 4.0이므로 **출처 표기**와 **ShareAlike**가 따라온다.
이 데이터로 만든 파생 사전 데이터를 배포하면 같은 라이선스로 공개해야 한다.
