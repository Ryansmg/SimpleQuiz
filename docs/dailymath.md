# DailyMath API

기존 quiz Next.js 서버와 Railway MySQL을 사용합니다. 새 서버 서비스나 로컬 MySQL 설치는 필요 없습니다. 코드 추가만으로 원격 배포나 DB 변경이 실행되지는 않습니다.

## 연결

1. 변경된 quiz 서버를 기존 Railway 서비스에 배포합니다. 기존 `MYSQL_URL`을 그대로 사용합니다.
2. 첫 인증 요청 시 `dailymath_account_progress`, `dailymath_sessions` 테이블을 생성합니다. DB 사용자는 CREATE TABLE 권한이 필요하며 기존 퀴즈 테이블은 변경하지 않습니다.
3. Android 프로젝트 `.env`에 `DAILYMATH_API_URL=https://quiz-서비스-도메인`을 넣고 다시 빌드합니다. MySQL 비밀번호는 앱에 넣지 않습니다.
4. 송죽학사 로그인 후 앱 설정에서 ‘지금 동기화’를 누릅니다. 새 기기나 재설치 후에도 같은 학교 계정으로 로그인하고 동기화하면 학습 기록·스트릭이 복원됩니다. PDF·필기 파일은 동기화 대상이 아닙니다.

## 인증 흐름

- 앱 → `POST /api/dailymath/auth`, JSON `{ "session_id": "학교 JSESSIONID" }`.
- 서버는 고정 URL `https://student.gs.hs.kr/student/mymenu/privateInfo.do`에 해당 JSESSIONID만 붙여 조회합니다. 리다이렉트는 따르지 않으며 자동 로그인 seed·학교 비밀번호는 받지 않습니다.
- 실제 응답의 ‘학번’ 행과 로그인 표기를 확인합니다. 학번이 모호하거나 로그인이 만료되면 인증을 거절합니다. 클라이언트가 보내는 학번·HTML은 신뢰하지 않습니다.
- 확인한 학번의 SHA-256을 공통 계정 키로 사용합니다. 임의의 256비트 앱 토큰을 발급하며 MySQL에는 토큰의 SHA-256·계정 키·만료 시각만 저장합니다.
- 반환값: `{ token, account, expires_at_ms }`. 앱은 Android Keystore로 암호화하여 저장합니다.
- 앱 토큰의 수명은 7일입니다. 만료되면 앱이 유효한 학교 세션으로 재인증합니다. 학교 세션까지 만료되면 송죽학사 재연결이 필요합니다.
- 학교 세션과 내정보 HTML은 확인하는 동안 메모리에서만 사용하며 저장·로그 출력하지 않습니다. 운영 프록시에서도 요청 본문이나 Authorization 헤더를 수집하지 않아야 합니다.
- `DELETE /api/dailymath/auth`는 Bearer 토큰 하나를 폐기합니다. 앱 연결 해제 시 로컬 토큰을 먼저 지우고 서버 폐기를 시도합니다. 오프라인에서 폐기가 실패한 토큰은 원래 만료 시각까지 유효합니다.

기기별로 발급 토큰은 달라도 검증한 학번이 같으면 같은 기록에 접근합니다. 학교 비밀번호 변경 자체는 계정 키를 바꾸지 않으므로 기록이 유지됩니다. 비밀번호 변경 직후 모든 앱 토큰을 자동으로 폐기하는 기능은 학교가 변경 이벤트를 제공하지 않아 지원하지 않습니다.

## 학습 기록

`GET /api/dailymath/progress`: 인증한 학번의 기록 배열을 반환합니다.

`PUT /api/dailymath/progress`: 최대 200개 기록을 한 트랜잭션으로 저장하고 204를 반환합니다.

두 메서드 모두 `Authorization: Bearer <서버 발급 토큰>`이 필요합니다. 계정은 DB의 토큰 매핑으로 결정합니다. `X-DailyMath-Account`를 보내도 대상 계정을 바꿀 수 없습니다.

기록은 `post_id`, `state` (`draft` 또는 `submitted`), `reply_id` (nullable), `solved_on` (YYYY-MM-DD, nullable), `updated_at_ms`입니다. 오래된 요청은 최신 상태를 덮어쓰지 않으며 최초 학습일은 보존합니다. `pending`은 학교에서 확인해야 하므로 동기화로 덮어쓰지 않습니다. PDF와 필기는 각 기기에 남습니다.

초기 기기별 구현의 `dailymath_progress` 테이블은 자동으로 옮기지 않습니다. 그 버전을 이미 배포했다면 해당 기기의 로컬 기록을 새 버전에서 동기화하세요. 기존 테이블은 삭제하지 않습니다.

## 검증 및 제한

- `npm run test:dailymath`: 입력·본문 제한·세션 확인·토큰 계정 매핑·만료·폐기 테스트 13개. DB 부분은 테스트 대역이며 실제 MySQL에 접속하지 않습니다.
- `npx tsc --noEmit`, 새 API/라이브러리 ESLint 통과.
- 사용자 허용 세션으로 Node 서버의 학교 검증 함수가 실제 내정보 페이지를 읽어 학번을 확인하는 테스트 통과. 세션·학번·프로필을 파일이나 로그에 남기지 않음.
- 실제 Railway 배포 및 토큰 발급/기록 저장의 MySQL 왕복은 배포 후 확인해야 합니다.
- 학교 내정보 HTML 구조가 바뀌면 인증은 실패하도록 처리합니다. `lib/dailymath-school.ts`의 선택 규칙과 테스트를 함께 갱신하세요.
- 요청 크기는 인증 2 KiB, 기록 128 KiB로 제한합니다. 프로세스 내 분당 요청 제한은 여러 인스턴스에서 공유되지 않으므로 확장 시 공유 제한기가 필요합니다.
