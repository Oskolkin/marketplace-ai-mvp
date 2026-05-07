\# Stage 10. AI Chat — tracing and security



\## Назначение документа



Этот документ фиксирует правила trace logging и security boundaries для stage 10: \*\*AI Chat MVP\*\*.



AI-чат работает по архитектуре:



```text

user question

&#x20; -> planner

&#x20; -> validated backend tool plan

&#x20; -> read-only backend tools

&#x20; -> fact context

&#x20; -> answerer

&#x20; -> answer validation

&#x20; -> trace

&#x20; -> UI



Главный принцип:



ChatGPT не получает прямой доступ к БД.

ChatGPT не выполняет действия.

Backend контролирует данные, tools, валидацию и trace.

Что такое trace



Trace — это техническая запись обработки одного пользовательского вопроса в AI-чате.



Trace нужен для:



диагностики ошибок;

анализа качества ответов;

проверки, какие tools выбрал Planner;

проверки, какие данные были переданы Answerer;

анализа token usage;

оценки стоимости OpenAI-запросов;

будущей админки и support tooling;

расследования спорных ответов AI.



Trace не является пользовательским сообщением.

Trace не должен напрямую отображаться в обычном UI пользователя.



Где хранится trace



Trace хранится в таблице:



chat\_traces



Trace связан с:



seller\_account\_id;

session\_id;

user\_message\_id;

assistant\_message\_id, если ответ успешно сохранён;

prompt versions;

model names;

tool plan;

tool results;

fact context;

raw AI responses;

validation result;

token usage;

status;

error message.

Что сохраняется в trace



В trace сохраняются следующие группы данных.



Lifecycle



Сохраняется:



status;

started\_at;

finished\_at;

created\_at;

error\_message.



Допустимые статусы:



running

completed

failed



Назначение:



running — обработка вопроса началась;

completed — вопрос успешно обработан, ответ сохранён;

failed — обработка завершилась ошибкой.

Prompt versions



Сохраняется:



planner\_prompt\_version;

answer\_prompt\_version.



Текущие значения stage 10:



stage\_10\_ai\_chat\_planner\_v1

stage\_10\_ai\_chat\_answer\_v1



Назначение:



понимать, какой prompt contract использовался;

сравнивать качество ответов между версиями;

расследовать ошибки при изменении prompt logic.

Model metadata



Сохраняется:



planner\_model;

answer\_model.



Назначение:



понимать, какая модель использовалась для Planner;

понимать, какая модель использовалась для Answerer;

в будущем сравнивать качество/стоимость разных моделей.

Detected intent



Сохраняется:



detected\_intent.



Примеры:



priorities

explain\_recommendation

unsafe\_ads

ad\_loss

sales

stock

advertising

pricing

alerts

recommendations

abc\_analysis

general\_overview

unknown

unsupported



Назначение:



понимать, как Planner классифицировал вопрос;

анализировать типовые запросы пользователей;

находить ошибки intent detection.

Raw planner response



В trace сохраняется:



raw\_planner\_response



Это исходный ответ OpenAI на первом AI-вызове — Planner.



Он нужен, чтобы понимать:



какой JSON вернула модель;

почему tool plan был принят или отклонён;

были ли нарушения contract;

были ли ошибки strict JSON parsing;

какие usage/token metadata пришли от provider.



Важно:



raw planner response не возвращается во frontend;

raw planner response не должен содержать API key;

raw planner response должен проходить defensive sanitization перед сохранением;

если raw response содержит потенциальный секрет, он должен быть замаскирован.

Tool plan payload



В trace сохраняется:



tool\_plan\_payload



Это распарсенный план, который предложил Planner.



Пример:



{

&#x20; "intent": "unsafe\_ads",

&#x20; "confidence": 0.9,

&#x20; "language": "ru",

&#x20; "tool\_calls": \[

&#x20;   {

&#x20;     "name": "get\_advertising\_analytics",

&#x20;     "args": {

&#x20;       "limit": 10

&#x20;     }

&#x20;   },

&#x20;   {

&#x20;     "name": "get\_stock\_risks",

&#x20;     "args": {

&#x20;       "limit": 10

&#x20;     }

&#x20;   }

&#x20; ],

&#x20; "assumptions": \[

&#x20;   "Период не указан, используется последние 30 дней."

&#x20; ],

&#x20; "unsupported\_reason": null

}



Назначение:



видеть, что именно предложил AI Planner;

сравнивать raw response и parsed payload;

понимать причину validation failure.

Validated tool plan payload



В trace сохраняется:



validated\_tool\_plan\_payload



Это уже проверенный backend’ом tool plan.



Backend validator проверяет:



tool exists in allowlist;

tool read-only;

args имеют допустимые типы;

limit не превышает максимум;

date range не превышает лимит;

enum values допустимы;

нельзя передать seller\_account\_id;

нельзя передать user\_id;

нельзя передать API key/token/secret;

нельзя запросить SQL/raw data;

нельзя запросить write/action;

нельзя вызвать слишком много tools;

нельзя вызвать один tool слишком много раз;

tool поддерживает выбранный intent.



Назначение:



понимать, какие tools реально были разрешены к исполнению;

исключать ситуацию, когда AI напрямую управляет доступом к данным.

Tool results payload



В trace сохраняется:



tool\_results\_payload



Это результаты выполнения read-only backend tools.



Примеры tools:



get\_dashboard\_summary

get\_open\_recommendations

get\_recommendation\_detail

get\_open\_alerts

get\_alerts\_by\_group

get\_critical\_skus

get\_stock\_risks

get\_advertising\_analytics

get\_price\_economics\_risks

get\_sku\_metrics

get\_sku\_context

get\_campaign\_context

run\_abc\_analysis



Tool results нужны, чтобы понимать:



какие данные были доступны Answerer;

какие tools упали;

какие tools вернули partial data;

какие limitations возникли;

почему Answerer дал конкретный ответ.



Важно:



tool results должны быть compact;

tool results не должны быть raw database dump;

tool results не должны содержать raw Ozon payloads;

tool results не должны содержать credentials;

tool results не должны содержать данные других seller accounts.

Fact context payload



В trace сохраняется:



fact\_context\_payload



Fact context — это финальный структурированный context, который backend передал Answerer.



Он включает:



question;

detected intent;

seller metadata без секретов;

validated tool plan;

tool results;

extracted facts;

related alerts;

related recommendations;

assumptions;

limitations;

freshness;

context stats.



Назначение:



видеть, какие именно факты были переданы Answerer;

проверять, не выдумал ли Answerer данные;

проверять, были ли limitations;

анализировать размер context;

понимать, какие related alerts/recommendations были доступны.



Важно:



FactContext проходит sanitization;

forbidden keys удаляются;

длинные строки обрезаются;

большие массивы ограничиваются;

raw payloads не передаются;

context не должен содержать secrets.

Raw answer response



В trace сохраняется:



raw\_answer\_response



Это исходный ответ OpenAI на втором AI-вызове — Answerer.



Он нужен для:



диагностики parsing errors;

проверки соблюдения strict JSON contract;

анализа качества ответа;

проверки, не вернула ли модель auto-action claims;

проверки, не сослалась ли модель на несуществующие ids.



Важно:



raw answer response не возвращается во frontend;

raw answer response должен быть sanitized;

raw answer response не должен содержать API key;

если ответ не прошёл validation, он не сохраняется как обычное assistant-сообщение.

Answer validation payload



В trace сохраняется:



answer\_validation\_payload



Это результат backend-проверки ответа Answerer.



Он должен включать:



is\_valid;

errors;

warnings;

final\_confidence\_level.



Validator проверяет:



JSON валиден;

answer не пустой;

summary не пустой;

confidence\_level допустимый;

supporting\_facts не пустые;

related alert ids существуют в FactContext;

related recommendation ids существуют в FactContext;

ответ не содержит auto-action claims;

ответ не говорит, что изменил цену/рекламу/остатки;

ответ не утверждает, что ходил в БД/Ozon напрямую;

ответ не ссылается на недоступные данные;

если context limitations есть, ответ их учитывает;

confidence downgraded при limitations/truncation/failed tools.

Token usage



В trace сохраняется:



input\_tokens;

output\_tokens.



Эти значения агрегируются по двум AI-вызовам:



planner input tokens + answerer input tokens

planner output tokens + answerer output tokens



Назначение:



мониторинг стоимости;

анализ тяжёлых запросов;

поиск слишком больших contexts;

оптимизация prompt и tool results;

будущий billing/admin tooling.

Estimated cost



В trace сохраняется:



estimated\_cost



В MVP допускается значение:



0



если точный расчёт стоимости ещё не реализован.



Важно:



не выдумывать стоимость;

не считать приблизительно без утверждённой модели расчёта;

в будущем стоимость можно рассчитывать на основе модели, input/output tokens и актуальных тарифов.

Что нельзя логировать



Нельзя сохранять в trace, application logs или frontend responses:



OPENAI\_API\_KEY;

Ozon API key;

Ozon Client-Id, если он считается секретным в контексте логов;

Authorization headers;

Bearer tokens;

session cookies;

password;

refresh tokens;

access tokens;

raw auth context;

full request headers;

database credentials;

connection strings с паролем;

raw Ozon payloads без необходимости;

raw orders dump;

raw products dump;

raw advertising metrics dump;

данные другого seller account;

SQL-запросы, сгенерированные AI;

любые секреты из .env.

Что не возвращается во frontend



Обычный пользовательский Chat API не должен возвращать:



raw\_planner\_response;

raw\_answer\_response;

tool\_plan\_payload;

validated\_tool\_plan\_payload;

tool\_results\_payload;

fact\_context\_payload;

answer\_validation\_payload;

token usage;

estimated cost;

provider error raw body;

API key;

auth/session internals.



Frontend может получить только:



session\_id;

user\_message\_id;

assistant\_message\_id;

trace\_id;

answer;

summary;

intent;

confidence\_level;

related\_alert\_ids;

related\_recommendation\_ids;

supporting\_facts;

limitations.



trace\_id можно показывать как debug reference, но не раскрывать сам trace.



Как маскируются секреты



Перед сохранением raw responses и context backend должен применять defensive sanitization.



Нужно маскировать или удалять ключи и значения, связанные с:



api\_key

authorization

token

password

secret

session\_token

cookie

OPENAI\_API\_KEY

Bearer

sk-



Пример маскирования:



{

&#x20; "authorization": "\[REDACTED]",

&#x20; "api\_key": "\[REDACTED]",

&#x20; "token": "\[REDACTED]"

}



Если строка содержит OpenAI-like secret:



sk-...



она должна быть заменена на:



\[REDACTED\_OPENAI\_KEY]



Если невозможно безопасно замаскировать значение, его лучше удалить полностью.



API key не сохраняется



OpenAI API key используется только backend OpenAI client’ом для HTTP-запроса к OpenAI API.



API key не должен:



сохраняться в chat\_traces;

сохраняться в chat\_messages;

сохраняться в chat\_feedback;

сохраняться в application logs;

передаваться во frontend;

попадать в raw planner response;

попадать в raw answer response;

попадать в fact context;

попадать в tool results.



Если OPENAI\_API\_KEY отсутствует:



приложение может стартовать;

POST /api/v1/chat/ask должен вернуть безопасную ошибку;

ошибка не должна раскрывать secrets или internal config.

ChatGPT не ходит в БД



ChatGPT не получает:



database credentials;

SQL schema;

SQL connection;

direct DB access;

raw SQL execution tool.



ChatGPT может только:



как Planner — предложить tool plan из allowlist;

как Answerer — сформировать ответ на основе FactContext.



Правильный flow:



ChatGPT Planner выбирает разрешённые tools.

Backend валидирует tool plan.

Backend исполняет read-only tools.

Backend собирает FactContext.

ChatGPT Answerer отвечает по FactContext.



Неправильный flow:



ChatGPT пишет SQL.

ChatGPT читает БД.

ChatGPT получает raw database dump.

ChatGPT сам выбирает seller\_account\_id.

Read-only tools



Все tools AI-чата должны быть read-only.



Разрешены только tools, которые читают данные:



dashboard summary;

recommendations;

alerts;

critical SKU;

stock risks;

advertising analytics;

pricing/economics risks;

SKU metrics;

SKU context;

campaign context;

ABC analysis.



Запрещены tools, которые:



меняют цену;

меняют рекламный бюджет;

запускают рекламу;

останавливают рекламу;

создают поставку;

изменяют карточку товара;

закрывают alert;

принимают recommendation;

отклоняют recommendation;

меняют pricing constraints;

пишут в Ozon;

пишут в БД бизнес-действия.

Seller scope



Все trace и tool results должны быть seller-scoped.



Правила:



seller\_account\_id берётся только из backend auth context;

Planner не может передавать seller\_account\_id;

Answerer не может выбирать seller account;

tools не принимают seller account из args;

все repository queries фильтруются по seller\_account\_id;

trace хранится с seller\_account\_id;

чтение session/messages/traces должно быть seller-scoped.



Запрещено:



читать данные другого seller account;

смешивать данные разных seller accounts;

возвращать cross-account aggregates;

принимать seller\_account\_id из frontend body.

User messages



В chat\_messages сохраняются:



user question;

assistant answer;

meta/error messages, если используются.



Сообщения пользователя могут содержать коммерчески чувствительные данные. Поэтому:



их нельзя логировать в application logs без необходимости;

их нельзя отправлять в сторонние сервисы, кроме OpenAI в рамках AI Chat flow;

их нельзя показывать другому seller account;

их нельзя использовать вне контекста текущего продукта без отдельного решения.

Error handling and trace



Если ошибка произошла после создания trace, backend должен:



вызвать FailTrace;

сохранить error\_message;

сохранить доступные payloads, если они безопасны;

не сохранять unsafe assistant answer как обычное сообщение;

вернуть frontend безопасную ошибку.



Примеры error flow:



Planner failed

user message сохранён;

trace создан;

FailTrace;

assistant message не сохраняется;

frontend получает safe error.

Tool plan invalid

raw planner response сохраняется;

tool plan payload сохраняется;

validated tool plan может быть пустым;

trace failed;

tools не выполняются.

Tool execution partial failure

failed tool записывается в tool\_results\_payload;

limitation попадает в FactContext;

Answerer может ответить по доступным данным;

trace может быть completed, если ответ валиден.

Answer validation failed

raw answer response сохраняется;

answer validation payload сохраняется;

trace failed;

unsafe assistant message не сохраняется;

frontend получает safe error.

Raw responses и privacy



Raw AI responses полезны для диагностики, но потенциально чувствительны.



Поэтому:



raw responses хранятся только backend-side;

не отображаются пользователю;

не используются в обычном UI;

должны быть доступны только будущей внутренней админке/support tooling;

должны быть sanitized;

не должны содержать secrets.

Context size and data minimization



FactContext должен быть компактным.



Нельзя отправлять в OpenAI:



тысячи SKU;

все заказы;

все товары;

все рекламные строки;

raw payloads;

полные таблицы;

лишние поля.



Нужно отправлять:



top N;

compact summaries;

evidence summaries;

related alerts;

related recommendations;

необходимые metrics;

limitations.



Если context слишком большой:



массивы обрезаются;

длинные строки truncation;

добавляется limitation;

confidence может быть downgraded.

Trace access policy



В MVP trace не должен быть доступен обычному пользователю через API.



В будущем trace может быть доступен:



internal admin;

support tooling;

debugging view.



Но даже во внутренней админке нужно:



не показывать secrets;

показывать seller scope;

ограничить доступ по ролям;

не раскрывать raw payloads без необходимости.

Safe frontend contract



Frontend получает только безопасный результат:



{

&#x20; "session\_id": 123,

&#x20; "user\_message\_id": 456,

&#x20; "assistant\_message\_id": 457,

&#x20; "trace\_id": 789,

&#x20; "answer": " ... ",

&#x20; "summary": " ... ",

&#x20; "intent": "priorities",

&#x20; "confidence\_level": "high",

&#x20; "related\_alert\_ids": \[1, 2],

&#x20; "related\_recommendation\_ids": \[10],

&#x20; "supporting\_facts": \[],

&#x20; "limitations": \[]

}



Frontend не должен знать:



какие prompts были отправлены;

какой raw planner response пришёл;

какой raw answer response пришёл;

какие tool payloads использовались;

какие token usage/cost были рассчитаны.

Security checklist



Перед закрытием stage 10 нужно проверить:



OpenAI API key не находится в git;

.env.example содержит только placeholder;

API key не возвращается API;

API key не сохраняется в trace;

raw responses sanitization включена;

FactContext sanitization включена;

tool plan validator запрещает seller\_account\_id;

tool plan validator запрещает SQL/raw/write args;

tools read-only;

tool results seller-scoped;

AnswerValidator запрещает auto-action claims;

Chat API не возвращает trace internals;

feedback можно оставить только на assistant answer;

archived session не принимает новые сообщения;

OpenAI errors возвращаются frontend как safe errors.

Итоговое правило



AI-чат должен быть полезным, но контролируемым.



Правильная модель:



AI помогает понять вопрос и сформировать ответ.

Backend контролирует данные, tools, безопасность и trace.



Недопустимая модель:



AI напрямую читает БД, выполняет действия и сам решает, какие данные можно раскрыть.



Stage 10 должен сохранять именно первую модель.

