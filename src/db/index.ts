import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL이 설정되지 않았습니다. .env.example을 참고해 .env를 만드세요.')
}

// 개발 중 HMR로 커넥션이 계속 쌓이는 것을 막기 위해 전역에 캐시한다.
const globalForDb = globalThis as unknown as { __niben_pg?: postgres.Sql }

// prepare: false 는 pgbouncer 등 트랜잭션 풀러를 쓰는 호스팅(Supabase 등)에서 필요하다.
const client = globalForDb.__niben_pg ?? postgres(connectionString, { prepare: false })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__niben_pg = client
}

export const db = drizzle(client, { schema })

export { schema }
