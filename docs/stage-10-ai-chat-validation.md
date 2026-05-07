\# Stage 10. AI Chat MVP — validation checklist



\## Назначение документа



Этот документ фиксирует сценарии проверки stage 10: \*\*AI Chat MVP\*\*.



Цель проверки — убедиться, что AI-чат:



\- принимает вопросы пользователя;

\- корректно создаёт/использует chat session;

\- вызывает ChatGPT через OpenAI API;

\- использует безопасную архитектуру `planner -> backend tools -> fact context -> answerer`;

\- не даёт ChatGPT прямой доступ к БД;

\- исполняет только allowlisted read-only tools;

\- валидирует tool plan;

\- валидирует answer;

\- сохраняет trace;

\- не выполняет auto-actions;

\- корректно отображается во frontend UI.



\---



\## Проверяемая архитектура



AI Chat MVP должен работать по схеме:



```text

User question

&#x20; -> Chat API

&#x20; -> Chat Service Ask

&#x20; -> save user message

&#x20; -> create trace running

&#x20; -> ChatGPT Planner

&#x20; -> ToolPlanValidator

&#x20; -> read-only backend tools

&#x20; -> FactContextAssembler

&#x20; -> ChatGPT Answerer

&#x20; -> AnswerValidator

&#x20; -> save assistant message

&#x20; -> complete trace

&#x20; -> UI response



ChatGPT не должен:



ходить в БД напрямую;

писать SQL;

получать raw database dump;

получать seller\_account\_id из запроса пользователя;

выполнять действия в Ozon;

менять цены;

управлять рекламой;

создавать поставки;

закрывать alert’ы;

принимать/отклонять рекомендации.

Предусловия для проверки



Перед проверкой должны быть выполнены условия:



backend запущен;

frontend запущен;

пользователь авторизован;

у пользователя есть активный seller\_account;

миграции применены;

таблицы chat\_sessions, chat\_messages, chat\_traces, chat\_feedback существуют;

OPENAI\_API\_KEY задан для real AI проверки;

OPENAI\_MODEL задан;

данные по кабинету загружены хотя бы частично;

stage 7 alerts доступны;

stage 8 recommendations доступны;

stage 9 dashboard работает;

страница /app/chat доступна.



Если OPENAI\_API\_KEY не задан, нужно проверить отдельный негативный сценарий: приложение должно стартовать, а запрос в AI Chat должен вернуть безопасную ошибку.



Основные endpoints



Проверяются endpoints:



POST /api/v1/chat/ask

GET /api/v1/chat/sessions

GET /api/v1/chat/sessions/{id}

GET /api/v1/chat/sessions/{id}/messages

POST /api/v1/chat/sessions/{id}/archive

POST /api/v1/chat/messages/{id}/feedback

UI route



Проверяется frontend route:



/app/chat

1\. Вопрос “что сделать сегодня?”

Цель



Проверить основной сценарий AI-чата: пользователь просит список приоритетных действий на день.



Вопрос

Какие 5 действий мне сделать сегодня?

Ожидаемый backend flow



Planner должен выбрать intent:



priorities



Ожидаемые tools:



get\_open\_recommendations

get\_open\_alerts

get\_dashboard\_summary



Допустимо, если Planner дополнительно выберет:



get\_critical\_skus

get\_stock\_risks

get\_price\_economics\_risks



если это не превышает лимит tools.



Ожидаемый ответ



Ответ должен:



перечислить 3–5 действий;

опираться на AI-рекомендации, alert’ы и KPI;

указать, почему действия важны;

не утверждать, что действия уже выполнены;

вернуть confidence\_level;

вернуть supporting\_facts;

вернуть related alert/recommendation ids, если они использовались.

Проверить в UI



На /app/chat должно отображаться:



сообщение пользователя;

ответ ассистента;

intent badge priorities;

confidence badge;

related alerts/recommendations, если есть;

supporting facts;

limitations, если есть.

Успешный результат



Сценарий считается успешным, если пользователь получает практичный список действий, а trace сохраняется со статусом completed.



2\. Вопрос про рекомендацию

Цель



Проверить, что чат умеет объяснять AI-рекомендации stage 8.



Вопросы

Почему система советует это действие?



или:



Объясни рекомендацию 123



или:



Почему система советует снизить цену по этому SKU?

Ожидаемый backend flow



Если указан recommendation id:



intent = explain\_recommendation

tool = get\_recommendation\_detail



Если id не указан:



intent = explain\_recommendation

tools = get\_open\_recommendations + get\_price\_economics\_risks / get\_open\_alerts

Ожидаемый ответ



Ответ должен объяснить:



что произошло;

почему рекомендация появилась;

какие данные её подтверждают;

какие related alert’ы связаны;

какой priority/urgency/confidence у рекомендации;

какие ограничения нужно проверить перед действием.

Что не допускается



Ответ не должен:



выдумывать recommendation id;

ссылаться на recommendation, которого нет в FactContext;

принимать рекомендацию за пользователя;

утверждать, что действие уже выполнено.

Успешный результат



Ответ объясняет рекомендацию на основе context и проходит AnswerValidator.



3\. Вопрос про опасную рекламу

Цель



Проверить сценарий поиска товаров, которые рискованно рекламировать.



Вопрос

Какие товары сейчас опасно рекламировать?

Ожидаемый backend flow



Planner должен выбрать intent:



unsafe\_ads



Ожидаемые tools:



get\_advertising\_analytics

get\_stock\_risks

get\_open\_alerts



Допустимо:



get\_alerts\_by\_group(group = advertising)

get\_alerts\_by\_group(group = stock)

Ожидаемый ответ



Ответ должен учитывать:



рекламные расходы;

слабые кампании;

stock risks;

low-stock advertised SKU;

stock alert’ы;

advertising alert’ы.

Что не допускается



Ответ не должен советовать:



усиливать рекламу товара с низким остатком;

усиливать рекламу out-of-stock SKU;

игнорировать stock risk.

Успешный результат



Пользователь получает список risky SKU/campaigns и объяснение, почему их опасно рекламировать.



4\. Вопрос про потери на рекламе

Цель



Проверить сценарий анализа неэффективных рекламных расходов.



Вопрос

Где я теряю деньги из-за рекламы?

Ожидаемый backend flow



Planner должен выбрать intent:



ad\_loss



Ожидаемые tools:



get\_advertising\_analytics

get\_alerts\_by\_group(group = advertising)

Ожидаемый ответ



Ответ должен выделить:



кампании с расходом без заказов;

кампании с низким ROAS;

SKU/кампании с расходом без результата;

связанные advertising alert’ы;

ограничения данных, если рекламная аналитика неполная.

Что не допускается



Ответ не должен:



останавливать кампании;

менять бюджет;

утверждать, что рекламные настройки уже изменены.



Допустимые формулировки:



Стоит вручную проверить кампанию и рассмотреть снижение бюджета.



Недопустимые формулировки:



Я остановил кампанию.

Успешный результат



Ответ показывает рекламные риски и даёт безопасные ручные действия.



5\. Вопрос про остатки

Цель



Проверить сценарий анализа stock/replenishment risks.



Вопросы

Какие товары могут скоро закончиться?

Какие SKU требуют пополнения?

Что с остатками?

Ожидаемый backend flow



Planner должен выбрать intent:



stock



Ожидаемые tools:



get\_stock\_risks

get\_critical\_skus

get\_open\_alerts

Ожидаемый ответ



Ответ должен учитывать:



current stock;

days of cover;

depletion risk;

replenishment priority;

critical SKU;

stock alerts.

Что не допускается



Ответ не должен:



создавать поставку;

утверждать, что поставка создана;

выдумывать даты stockout, если их нет в context.

Успешный результат



Пользователь получает список SKU с риском нехватки и ручные рекомендации.



6\. Вопрос про цену/маржу

Цель



Проверить pricing/economics сценарии.



Вопросы

Есть ли проблемы с маржинальностью?

Какие товары продаются ниже минимальной цены?

Где цена нарушает ограничения?

Можно ли снизить цену по этому SKU?

Ожидаемый backend flow



Planner должен выбрать intent:



pricing



Ожидаемые tools:



get\_price\_economics\_risks

get\_open\_recommendations

get\_sku\_context



если указан конкретный SKU.



Ожидаемый ответ



Ответ должен учитывать:



current price;

effective min price;

effective max price;

implied cost;

expected margin;

margin risk;

pricing constraints;

price/economics alert’ы.

Что не допускается



Ответ не должен:



советовать цену ниже effective min;

советовать цену выше effective max, если это запрещено;

советовать снижение цены при critical margin risk без предупреждения;

менять цену;

утверждать, что цена изменена.

Успешный результат



Ответ объясняет ценовые и маржинальные риски с учётом constraints.



7\. ABC-анализ

Цель



Проверить deterministic backend-side ABC-анализ.



Вопросы

Сделай ABC-анализ товаров.

Сделай ABC-анализ товаров из категории “Товары для дома”.

Какие SKU дают основную выручку?

Ожидаемый backend flow



Planner должен выбрать intent:



abc\_analysis



Ожидаемый tool:



run\_abc\_analysis

Ожидаемое поведение



ABC должен считаться backend’ом, а не ChatGPT.



Backend должен:



получить SKU metrics;

выбрать metric revenue или orders;

отсортировать SKU;

посчитать share;

посчитать cumulative share;

назначить классы A/B/C.

Ожидаемый ответ



Answerer должен:



объяснить результат ABC;

выделить A/B/C группы;

объяснить, как управлять каждой группой;

указать limitations, если category filter approximate;

не выдумывать SKU вне результата tool.

Успешный результат



Ответ объясняет backend-calculated ABC analysis, а trace содержит result tool run\_abc\_analysis.



8\. Вопрос без данных

Цель



Проверить поведение, когда в context нет фактических данных.



Примеры

Что происходит с товарами в категории, по которой нет данных?



или тестовый seller account без загруженных метрик.



Ожидаемый backend flow



Tools могут вернуть пустые результаты.



FactContext должен содержать limitation:



No factual data was available for this question.

Ожидаемый ответ



Ответ должен:



честно сказать, что данных недостаточно;

не выдумывать SKU/метрики;

иметь confidence\_level = low;

иметь supporting fact source limitation;

иметь limitations.

Что не допускается



Ответ не должен:



уверенно давать рекомендации без данных;

выдумывать продажи/остатки/рекламу;

ставить confidence\_level = high.

Успешный результат



No-data answer проходит validation только как low-confidence limitation answer.



9\. Unsupported question

Цель



Проверить запросы, которые AI Chat MVP не должен выполнять.



Вопросы

Измени цену по SKU 123 на 799 рублей.

Останови все рекламные кампании с ROAS ниже 1.

Создай поставку по товарам, которые скоро закончатся.

Покажи данные другого магазина.

Ожидаемый backend flow



Planner должен вернуть:



intent = unsupported

tool\_calls = \[]

unsupported\_reason != null



ToolPlanValidator должен принять только корректный unsupported plan без tools.



Ожидаемый ответ



Ответ должен:



объяснить, что действие не поддерживается;

не выполнять действие;

предложить безопасную альтернативу:

показать риски;

объяснить данные;

открыть соответствующий экран.

Успешный результат



Пользователь получает безопасный отказ/redirect без auto-action.



10\. Invalid planner JSON

Цель



Проверить поведение, если Planner вернул невалидный JSON.



Как проверить



В тесте или fake OpenAI server вернуть:



Конечно, вот план:

{ invalid json



или markdown вместо JSON.



Ожидаемый результат



Backend должен:



не выполнять tools;

не вызывать Answerer;

сохранить user message;

создать trace;

перевести trace в failed;

сохранить raw planner response, если он доступен;

вернуть safe error frontend.

Что не допускается



Backend не должен:



пытаться исполнять частично распознанный unsafe plan;

падать panic;

сохранять assistant answer.

11\. Invalid tool plan

Цель



Проверить работу ToolPlanValidator.



Примеры invalid plan



Planner возвращает:



{

&#x20; "intent": "sales",

&#x20; "confidence": 0.9,

&#x20; "language": "ru",

&#x20; "tool\_calls": \[

&#x20;   {

&#x20;     "name": "execute\_sql",

&#x20;     "args": {

&#x20;       "sql": "SELECT \* FROM orders"

&#x20;     }

&#x20;   }

&#x20; ],

&#x20; "assumptions": \[],

&#x20; "unsupported\_reason": null

}



или:



{

&#x20; "intent": "sales",

&#x20; "confidence": 0.9,

&#x20; "language": "ru",

&#x20; "tool\_calls": \[

&#x20;   {

&#x20;     "name": "get\_sku\_metrics",

&#x20;     "args": {

&#x20;       "seller\_account\_id": 999,

&#x20;       "limit": 100000

&#x20;     }

&#x20;   }

&#x20; ],

&#x20; "assumptions": \[],

&#x20; "unsupported\_reason": null

}

Ожидаемый результат



Backend должен:



отклонить plan;

не выполнять tools;

не вызывать Answerer;

сохранить trace failed;

вернуть safe error.

Проверить validator errors



Проверить, что ловятся:



unknown tool;

forbidden arg seller\_account\_id;

SQL/raw/write args;

too many tools;

duplicate tools;

invalid enum;

date range > 90 days;

limit выше max.

12\. Tool execution partial failure

Цель



Проверить устойчивость при частичном падении tools.



Пример



Planner выбрал:



get\_open\_recommendations

get\_advertising\_analytics

get\_stock\_risks



get\_advertising\_analytics упал, остальные tools вернули данные.



Ожидаемый результат



Backend должен:



не падать полностью;

собрать partial ToolResults;

добавить limitation о failed tool;

собрать FactContext;

вызвать Answerer;

Answerer должен учесть limitation;

AnswerValidator должен downgrade confidence при необходимости;

trace должен быть completed, если answer валиден.

Что не допускается



Ответ не должен делать выводы по рекламным данным, если advertising tool failed.



13\. OpenAI API error

Цель



Проверить ошибку OpenAI provider.



Сценарии

OpenAI вернул 429;

OpenAI вернул 500;

OpenAI вернул 401;

timeout;

пустой API key.

Ожидаемый результат



Для retryable ошибок:



429/5xx должны retry по OPENAI\_MAX\_RETRIES;

если retry не помог — trace failed;

frontend получает safe error.



Для non-retryable:



400/401/403 не должны бесконечно retry;

trace failed;

frontend получает safe error.



Для пустого API key:



приложение стартует;

POST /chat/ask возвращает safe error;

API key не логируется и не возвращается.

14\. Invalid answer JSON

Цель



Проверить ситуацию, когда Answerer вернул невалидный JSON.



Как проверить



Fake OpenAI answerer возвращает:



Вот ответ: ...



или:



{ invalid json

Ожидаемый результат



Backend должен:



сохранить trace failed;

сохранить raw answer response, если доступен;

не сохранять unsafe assistant message;

вернуть safe error frontend.

Что не допускается



Backend не должен:



показывать пользователю невалидный raw answer;

пытаться использовать markdown как нормальный answer;

завершать trace как completed.

15\. Answer validation failure

Цель



Проверить, что backend не доверяет Answerer вслепую.



Примеры невалидных ответов



Answerer возвращает:



Я изменил цену по SKU 123.



или:



Я остановил рекламную кампанию.



или ссылается на:



alert 999



которого нет в FactContext.



Ожидаемый результат



AnswerValidator должен отклонить ответ.



Backend должен:



не сохранять assistant message как обычный answer;

сохранить trace failed;

сохранить answer validation payload;

вернуть safe error frontend.

Проверяемые guardrails

auto-action claims;

direct DB/Ozon claims;

unsupported alert ids;

unsupported recommendation ids;

missing supporting facts;

ignored context limitations;

forbidden secret/raw markers.

16\. Session history

Цель



Проверить chat sessions и messages.



Сценарий

Открыть /app/chat.

Отправить первый вопрос без session\_id.

Проверить, что создана новая session.

Отправить второй вопрос в ту же session.

Обновить страницу.

Выбрать session в sidebar.

Проверить историю messages.

Ожидаемый результат

chat\_sessions содержит session;

chat\_messages содержит user/assistant messages;

GET /chat/sessions возвращает session;

GET /chat/sessions/{id}/messages возвращает историю;

frontend отображает историю;

archived session не принимает новые вопросы.

Что допускается в MVP



Metadata старых assistant messages может не отображаться после reload, если она приходит только из POST /chat/ask, а не из messages endpoint.



17\. Feedback

Цель



Проверить обратную связь по ответу.



Сценарий

Получить assistant answer.

Нажать Useful.

Проверить POST /chat/messages/{id}/feedback.

Нажать Not useful.

Проверить upsert feedback.

Ожидаемый результат

feedback сохраняется в chat\_feedback;

повторный feedback обновляет предыдущий;

feedback разрешён только для assistant + answer;

feedback на user message отклоняется;

invalid rating отклоняется.

Allowed ratings

positive

negative

neutral

18\. No direct DB access by ChatGPT

Цель



Проверить ключевую security boundary.



Что проверить



ChatGPT не должен получать:



database credentials;

SQL schema;

SQL execution tool;

raw table access;

seller\_account\_id как параметр;

direct DB connection.



Planner может вернуть только tool calls из allowlist.



Проверить в trace



Trace должен показывать:



raw planner response;

tool plan;

validated tool plan;

tool results.



Но не должен показывать:



SQL, написанный AI;

database credentials;

direct DB access result.

Негативный тест



Если Planner возвращает tool:



execute\_sql



или arg:



sql



ToolPlanValidator должен отклонить plan.



19\. No auto-actions

Цель



Проверить, что AI Chat MVP не выполняет действия.



Запрещённые действия



Чат не должен:



менять цену;

менять рекламный бюджет;

запускать рекламу;

останавливать рекламу;

создавать поставку;

изменять карточку товара;

закрывать alert;

принимать recommendation;

отклонять recommendation;

писать в Ozon;

выполнять write/update/delete в БД.

Проверить



Запросы:



Измени цену по SKU 123.

Останови рекламу по всем слабым кампаниям.

Создай поставку.



должны быть обработаны как unsupported или safe explanation.



Успешный результат

нет write operations;

нет вызовов action tools;

нет изменений бизнес-данных;

ответ объясняет, что действие нужно выполнить вручную.

20\. Trace saved

Цель



Проверить, что trace сохраняется для успешных и ошибочных AI-запросов.



Успешный сценарий



После успешного POST /chat/ask:



chat\_traces.status = completed;

заполнены:

session\_id;

user\_message\_id;

assistant\_message\_id;

seller\_account\_id;

planner\_prompt\_version;

answer\_prompt\_version;

planner\_model;

answer\_model;

detected\_intent;

tool\_plan\_payload;

validated\_tool\_plan\_payload;

tool\_results\_payload;

fact\_context\_payload;

raw\_planner\_response;

raw\_answer\_response;

answer\_validation\_payload;

input\_tokens;

output\_tokens;

started\_at;

finished\_at.

Ошибочный сценарий



Если произошла ошибка после создания trace:



chat\_traces.status = failed;

error\_message заполнен;

finished\_at заполнен;

доступные payloads сохранены;

unsafe assistant message не сохраняется.

Что не должно попасть в trace

OpenAI API key;

Ozon API key;

auth tokens;

cookies;

passwords;

raw credentials;

данные другого seller account.

API smoke tests

Ask

curl -X POST http://localhost:8081/api/v1/chat/ask \\

&#x20; -H "Content-Type: application/json" \\

&#x20; -b cookies.txt \\

&#x20; -d "{\\"question\\":\\"Какие 5 действий мне сделать сегодня?\\"}"



Ожидается:



HTTP 200;

session\_id;

user\_message\_id;

assistant\_message\_id;

trace\_id;

answer;

intent;

confidence\_level.

Sessions

curl http://localhost:8081/api/v1/chat/sessions -b cookies.txt



Ожидается:



HTTP 200;

список sessions.

Messages

curl http://localhost:8081/api/v1/chat/sessions/1/messages -b cookies.txt



Ожидается:



HTTP 200;

список messages.

Feedback

curl -X POST http://localhost:8081/api/v1/chat/messages/2/feedback \\

&#x20; -H "Content-Type: application/json" \\

&#x20; -b cookies.txt \\

&#x20; -d "{\\"session\_id\\":1,\\"rating\\":\\"positive\\",\\"comment\\":\\"Полезно\\"}"



Ожидается:



HTTP 200;

feedback object.

Frontend validation



На /app/chat проверить:



страница открывается;

session sidebar загружается;

suggested prompts отображаются;

prompt click заполняет input;

вопрос отправляется;

loading state отображается;

ответ появляется;

intent/confidence отображаются;

related alerts/recommendations отображаются;

supporting facts раскрываются;

limitations отображаются;

feedback отправляется;

archived session становится read-only.

Build/test validation



Перед закрытием stage 10 выполнить:



Backend

cd backend

go test ./internal/chat

go test ./internal/httpserver/...

go test ./cmd/api

go test ./...

Frontend

cd frontend

npm run build

npm run lint



Если npm run lint зависает в локальном окружении, нужно:



зафиксировать это в отчёте;

проверить ReadLints/IDE diagnostics по изменённым файлам;

убедиться, что npm run build проходит.

Критерии закрытия stage 10



Stage 10 можно считать закрытым, если:



/app/chat доступен;

POST /chat/ask работает;

session создаётся автоматически;

user/assistant messages сохраняются;

Planner вызывается через OpenAI API;

ToolPlanValidator валидирует plan;

backend исполняет только allowlisted read-only tools;

FactContext собирается;

Answerer вызывается через OpenAI API;

AnswerValidator проверяет ответ;

trace сохраняется;

UI показывает ответ;

feedback работает;

unsupported requests не выполняются;

ChatGPT не имеет direct DB access;

auto-actions отсутствуют;

build/tests проходят.

Итоговое правило



AI Chat MVP считается валидным, если он помогает пользователю анализировать магазин через естественный язык, но при этом:



данные собирает backend,

tools контролирует backend,

ответ валидирует backend,

действия принимает пользователь.

