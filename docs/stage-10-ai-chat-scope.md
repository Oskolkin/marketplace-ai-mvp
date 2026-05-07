\# Stage 10. AI Chat MVP — scope и boundaries



\## Назначение документа



Этот документ фиксирует цель, границы и архитектурные принципы stage 10: \*\*AI Chat MVP\*\*.



К этому этапу в продукте уже реализованы:



\- загрузка данных Ozon;

\- аналитические агрегаты;

\- dashboard как рабочий центр;

\- pricing constraints;

\- alerts engine;

\- AI recommendations через ChatGPT via OpenAI API;

\- Recommendations UI;

\- dashboard-блок Today’s priorities.



Stage 10 добавляет второй AI-интерфейс продукта — AI-чат.



Если stage 8 отвечает на вопрос:



```text

Что система сама рекомендует сделать?



то stage 10 отвечает на вопрос:



Что пользователь хочет спросить у системы?

Краткая формулировка этапа



AI Chat MVP — это естественно-языковой интерфейс к данным магазина, alert’ам и AI-рекомендациям.



Пользователь задаёт вопрос в интерфейсе приложения, например:



Какие 5 действий мне сделать сегодня?



или:



Какие товары сейчас опасно рекламировать?



или:



Сделай ABC-анализ товаров из категории “Товары для дома”.



Система должна:



понять, какие данные нужны;

безопасно собрать эти данные backend-слоем;

передать ChatGPT только подготовленный context;

получить ответ;

проверить ответ;

сохранить trace;

показать ответ пользователю.

Главный архитектурный принцип



ChatGPT не получает прямой доступ к БД.



ChatGPT не должен:



писать SQL;

напрямую читать таблицы;

самостоятельно выбирать seller account;

получать raw database dump;

выполнять write/update/delete operations;

обращаться к Ozon напрямую.



Вся работа с данными выполняется backend-слоем приложения.



Целевая архитектура



Stage 10 использует архитектуру:



planner -> backend tools -> fact context -> answerer



Расширенная схема:



User question

&#x20; ↓

Backend receives question

&#x20; ↓

ChatGPT Planner builds tool plan

&#x20; ↓

Backend validates tool plan

&#x20; ↓

Backend executes allowed read-only data tools

&#x20; ↓

Backend assembles fact context

&#x20; ↓

ChatGPT Answerer generates final answer

&#x20; ↓

Backend validates answer

&#x20; ↓

Backend saves trace

&#x20; ↓

UI shows answer

Роль ChatGPT Planner



Planner — это первый AI-вызов.



Его задача — не отвечать пользователю, а определить, какие данные нужны для ответа.



Planner получает:



вопрос пользователя;

список разрешённых tools;

схемы tools;

ограничения;

текущую дату;

правила default period;

список запрещённых действий.



Planner возвращает structured tool plan.



Пример:



{

&#x20; "intent": "unsafe\_ads",

&#x20; "confidence": 0.86,

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

&#x20;   },

&#x20;   {

&#x20;     "name": "get\_open\_alerts",

&#x20;     "args": {

&#x20;       "groups": \["advertising", "stock"],

&#x20;       "limit": 10

&#x20;     }

&#x20;   }

&#x20; ],

&#x20; "assumptions": \[

&#x20;   "Период не указан, используется период по умолчанию."

&#x20; ],

&#x20; "unsupported\_reason": null

}

Роль backend tool validation



Backend не должен доверять tool plan вслепую.



После ответа Planner backend обязан проверить:



tool существует в allowlist;

tool является read-only;

аргументы имеют допустимый тип;

limit не превышает разрешённый максимум;

date range не превышает разрешённый максимум;

enum values допустимы;

пользователь не передал seller\_account\_id;

planner не запросил raw data;

planner не запросил write/action tool;

количество tools не превышает лимит;

tool plan не нарушает границы текущего seller account.



Если tool plan невалидный, backend не должен его исполнять.



Роль backend data tools



Backend исполняет только разрешённые read-only tools.



Tools — это не SQL, который пишет AI.

Tools — это заранее реализованные backend-функции.



Примеры tools:



get\_dashboard\_summary;

get\_open\_recommendations;

get\_recommendation\_detail;

get\_open\_alerts;

get\_alerts\_by\_group;

get\_critical\_skus;

get\_stock\_risks;

get\_advertising\_analytics;

get\_price\_economics\_risks;

get\_sku\_metrics;

get\_sku\_context;

get\_campaign\_context;

run\_abc\_analysis.



Каждый tool должен быть:



read-only;

scoped by current seller account;

ограничен по объёму;

безопасен по параметрам;

предсказуем по output shape.

Роль fact context assembler



После выполнения tools backend собирает единый structured context.



Fact context должен включать только те данные, которые нужны для ответа:



вопрос пользователя;

detected intent;

validated tool plan;

результаты tools;

assumptions;

limitations;

freshness metadata;

related alerts;

related recommendations;

supporting facts.



Fact context не должен содержать:



OpenAI API key;

auth/session tokens;

raw Ozon payloads;

полный dump таблиц;

данные других seller accounts;

лишние персональные данные;

write credentials.

Роль ChatGPT Answerer



Answerer — это второй AI-вызов.



Он получает:



исходный вопрос пользователя;

intent;

validated tool plan;

fact context;

limitations;

business constraints;

правила ответа.



Answerer формирует финальный ответ пользователю.



Answerer должен:



отвечать только на основе fact context;

не выдумывать факты;

явно указывать ограничения данных;

ссылаться на supporting facts;

объяснять reasoning простым языком;

давать практические выводы;

не утверждать, что выполнил действия в Ozon;

не предлагать auto-actions как уже выполненные.

Роль backend answer validation



Backend не должен blindly trust AI answer.



После ответа ChatGPT backend должен проверить:



ответ валиден;

ответ не пустой;

confidence level допустимый;

related alert ids существуют в fact context;

related recommendation ids существуют в fact context;

ответ не содержит auto-action claims;

ответ не утверждает, что цена/реклама/остатки уже изменены;

ответ не говорит, что ChatGPT напрямую ходил в БД или Ozon;

ответ не ссылается на данные, которых нет в context;

если данных недостаточно, ответ содержит limitation.



Если ответ не проходит validation, backend должен вернуть безопасный fallback или ошибку, а не показывать пользователю неподтверждённый ответ.



Роль trace logging



Каждый запрос в AI-чат должен сохранять trace.



Trace нужен для:



диагностики ошибок;

контроля качества ответов;

проверки tool plan;

анализа затрат OpenAI;

отладки prompt versions;

будущей админки;

поддержки пользователей.



Trace должен хранить:



user question;

planner prompt version;

answer prompt version;

planner model;

answer model;

detected intent;

raw planner response;

validated tool plan;

executed tools;

tool results;

fact context;

raw answer response;

answer validation result;

token usage;

estimated cost;

status;

error message;

timestamps.



Trace не должен хранить:



OpenAI API key;

auth tokens;

session cookies;

секреты;

данные других seller accounts.

Поддерживаемые темы MVP



AI Chat MVP должен поддерживать вопросы по темам:



продажи;

остатки;

реклама;

цена и экономика;

alert’ы;

AI-рекомендации;

приоритеты;

“что сделать сегодня?”;

“почему система советует это действие?”;

“какие товары сейчас опасно рекламировать?”;

“где я теряю деньги из-за рекламы?”;

“какие SKU требуют внимания?”;

“сделай ABC-анализ товаров”.

Примеры вопросов MVP

Какие 5 действий мне сделать сегодня?

Почему система советует снизить цену по этому SKU?

Какие товары сейчас опасно рекламировать?

Где я теряю деньги из-за рекламы?

Какие SKU требуют внимания?

Сделай ABC-анализ товаров из категории “Товары для дома”.

Какие товары могут скоро закончиться?

Есть ли проблемы с маржинальностью?

Пример flow: вопрос про опасную рекламу



Пользователь спрашивает:



Какие товары сейчас опасно рекламировать?



Planner возвращает tool plan:



{

&#x20; "intent": "unsafe\_ads",

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

&#x20;   },

&#x20;   {

&#x20;     "name": "get\_open\_alerts",

&#x20;     "args": {

&#x20;       "groups": \["advertising", "stock"],

&#x20;       "limit": 10

&#x20;     }

&#x20;   }

&#x20; ]

}



Backend:



валидирует tools;

подставляет seller account из auth context;

выполняет read-only tools;

собирает fact context;

отправляет context в Answerer.



Answerer отвечает:



Сейчас опасно усиливать рекламу по SKU X и SKU Y, потому что по ним есть активные рекламные расходы и низкий запас. По SKU X осталось 3 дня покрытия, а кампания продолжает тратить бюджет. Рекомендую сначала пополнить остатки или временно снизить рекламную активность.



Backend валидирует ответ и сохраняет trace.



Пример flow: ABC-анализ



Пользователь спрашивает:



Сделай ABC-анализ товаров из категории “Товары для дома”.



Planner выбирает tool:



{

&#x20; "intent": "abc\_analysis",

&#x20; "tool\_calls": \[

&#x20;   {

&#x20;     "name": "run\_abc\_analysis",

&#x20;     "args": {

&#x20;       "category\_hint": "Товары для дома",

&#x20;       "period": "last\_30\_days",

&#x20;       "metric": "revenue",

&#x20;       "limit": 100

&#x20;     }

&#x20;   }

&#x20; ],

&#x20; "assumptions": \[

&#x20;   "Период не указан, используется последние 30 дней.",

&#x20;   "ABC-анализ строится по выручке."

&#x20; ]

}



Backend:



валидирует plan;

сам считает ABC-анализ;

формирует fact context с классами A/B/C;

отправляет результат в Answerer.



ChatGPT не считает ABC из raw data самостоятельно.

Он объясняет уже рассчитанный backend-результат.



Auto-actions запрещены



AI-чат не должен выполнять действия за пользователя.



Чат не может:



изменить цену;

остановить рекламу;

запустить рекламу;

изменить бюджет;

создать поставку;

изменить карточку товара;

изменить pricing constraints;

закрыть alert;

принять рекомендацию.



Чат может только:



объяснить;

подсветить риск;

предложить действие;

дать ссылку/ориентир на соответствующий экран.

Что входит в scope stage 10



В stage 10 входит:



chat data model;

chat sessions;

chat messages;

chat traces;

chat feedback;

AI planner;

planner prompt contract;

tool allowlist;

tool plan validation;

read-only data tools;

fact context assembler;

answer prompt contract;

OpenAI integration for chat;

answer validation;

Chat API;

Chat UI;

dashboard/navigation link;

validation documentation.

Что не входит в scope stage 10



Stage 10 не включает:



прямой SQL от ChatGPT;

прямой доступ ChatGPT к БД;

tool’ы на запись;

auto-actions;

изменение цен;

управление рекламой;

создание поставок;

billing;

админку;

autonomous agent;

multi-step autonomous planning;

голосовой интерфейс;

полноценный BI-конструктор;

ручное редактирование рекомендаций через чат;

генерацию новых AI-рекомендаций через чат;

управление Ozon через чат.

Источники данных AI-чата



AI-чат должен использовать уже существующие backend-слои:



dashboard analytics;

daily account metrics;

daily SKU metrics;

critical SKU analytics;

stock/replenishment analytics;

advertising analytics;

pricing constraints;

effective constraints;

alerts;

alert evidence payload;

AI recommendations;

recommendation supporting metrics;

recommendation related alerts;

freshness metadata.

Security boundaries



AI Chat MVP должен соблюдать границы безопасности:



seller account определяется только backend auth context;

AI не может передать seller\_account\_id;

AI не может запросить чужие данные;

все tools read-only;

tool results ограничены лимитами;

raw payloads не передаются в ChatGPT;

OpenAI API key не передаётся во frontend;

OpenAI API key не сохраняется в trace;

write operations запрещены;

unsupported questions должны получать честный ответ о недостатке данных.

Минимальные критерии завершения stage 10



Stage 10 считается завершённым, если:



пользователь может открыть /app/chat;

пользователь может задать вопрос;

backend создаёт chat session;

backend сохраняет user message;

backend вызывает Planner;

backend валидирует tool plan;

backend исполняет только разрешённые read-only tools;

backend собирает fact context;

backend вызывает Answerer;

backend валидирует answer;

backend сохраняет assistant message;

backend сохраняет trace;

пользователь видит ответ в UI;

пользователь может оставить feedback;

ChatGPT не имеет прямого доступа к БД;

чат не выполняет auto-actions.

Итог stage 10



После stage 10 пользователь получает естественно-языковой интерфейс к данным магазина.



Он может спросить:



Что мне сделать сегодня?

Почему система советует это действие?

Какие товары сейчас опасно рекламировать?

Где я теряю деньги из-за рекламы?

Сделай ABC-анализ товаров.



А система отвечает безопасно, на основе backend-собранного context:



question

&#x20; -> planner

&#x20; -> validated backend tool plan

&#x20; -> read-only tools

&#x20; -> fact context

&#x20; -> answerer

&#x20; -> answer validation

&#x20; -> trace

&#x20; -> UI



Главный результат stage 10:



AI-чат становится безопасным естественно-языковым интерфейсом к данным, alert’ам и AI-рекомендациям магазина.

