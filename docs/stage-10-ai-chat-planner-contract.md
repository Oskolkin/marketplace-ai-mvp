Ниже готовое содержимое для файла:



`docs/stage-10-ai-chat-planner-contract.md`



````markdown id="mw3rqa"

\# Stage 10. AI Chat Planner — prompt contract



\## Назначение документа



Этот документ фиксирует contract для \*\*AI Chat Planner\*\* в рамках stage 10: AI Chat MVP.



Planner — это первый AI-вызов в архитектуре AI-чата.



Он не отвечает пользователю напрямую.  

Его задача — понять вопрос пользователя и сформировать безопасный structured tool plan, который backend сможет проверить и исполнить через allowlisted read-only tools.



Целевая архитектура stage 10:



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

````



\---



\## Роль Planner



Planner определяет:



\* intent вопроса;

\* язык вопроса;

\* confidence определения intent;

\* какие backend data tools нужны;

\* какие параметры нужны для tools;

\* какие ограничения явно указал пользователь;

\* какие assumptions нужно применить;

\* является ли вопрос unsupported.



Planner не должен формировать финальный ответ пользователю.



\---



\## Что Planner НЕ делает



Planner не делает:



\* финальный текстовый ответ пользователю;

\* SQL-запросы;

\* прямой доступ к БД;

\* чтение raw tables;

\* чтение raw Ozon payloads;

\* write/update/delete operations;

\* изменение цен;

\* управление рекламой;

\* создание поставок;

\* принятие/закрытие рекомендаций;

\* закрытие alert’ов;

\* любые auto-actions.



Planner только возвращает JSON-план.



\---



\## Planner input



Planner получает от backend:



\* user question;

\* current date;

\* default period rules;

\* allowed tool list;

\* tool schemas;

\* allowed enum values;

\* limits;

\* forbidden actions;

\* safety constraints;

\* instruction to return strict JSON only.



Planner не получает:



\* прямой доступ к БД;

\* SQL schema;

\* database credentials;

\* seller account id как редактируемый параметр;

\* OpenAI API key;

\* auth/session tokens.



\---



\## Planner output format



Planner должен вернуть только валидный JSON object.



Никакого markdown, пояснений или текста вне JSON.



Базовый формат:



```json

{

&#x20; "intent": "priorities",

&#x20; "confidence": 0.85,

&#x20; "language": "ru",

&#x20; "tool\_calls": \[

&#x20;   {

&#x20;     "name": "get\_open\_recommendations",

&#x20;     "args": {

&#x20;       "limit": 5,

&#x20;       "priority\_levels": \["critical", "high"]

&#x20;     }

&#x20;   }

&#x20; ],

&#x20; "assumptions": \[

&#x20;   "Период не указан, используется последние 30 дней"

&#x20; ],

&#x20; "unsupported\_reason": null

}

```



\---



\## Output fields



\### `intent`



Тип: `string`

Обязательное поле.



Допустимые значения:



```text

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

```



Описание:



\* `priorities` — пользователь спрашивает, что сделать сегодня / какие действия важнее.

\* `explain\_recommendation` — пользователь спрашивает, почему система дала рекомендацию.

\* `unsafe\_ads` — пользователь спрашивает, какие товары опасно рекламировать.

\* `ad\_loss` — пользователь спрашивает, где реклама тратит деньги без результата.

\* `sales` — вопросы о продажах, выручке, заказах, динамике.

\* `stock` — вопросы об остатках, out-of-stock, покрытии запасов.

\* `advertising` — общие вопросы о рекламе.

\* `pricing` — вопросы о цене, min/max constraints, марже.

\* `alerts` — вопросы об alert’ах.

\* `recommendations` — вопросы об AI-рекомендациях.

\* `abc\_analysis` — вопросы про ABC-анализ товаров/SKU.

\* `general\_overview` — общий обзор состояния кабинета.

\* `unknown` — planner не уверен, но вопрос потенциально относится к магазину.

\* `unsupported` — вопрос вне возможностей системы или требует недоступных данных/actions.



\---



\### `confidence`



Тип: `number`

Обязательное поле.



Диапазон:



```text

0.0 <= confidence <= 1.0

```



Описание:



\* уверенность Planner в выбранном intent и tool plan;

\* если confidence низкий, backend может вернуть уточняющий вопрос или safe fallback;

\* для unsupported intent confidence может отражать уверенность, что вопрос не поддерживается.



\---



\### `language`



Тип: `string`

Обязательное поле.



Допустимые значения MVP:



```text

ru

en

unknown

```



Описание:



\* язык вопроса пользователя;

\* финальный answerer должен отвечать на языке пользователя;

\* если язык неизвестен, использовать `unknown`.



\---



\### `tool\_calls`



Тип: `array`

Обязательное поле.



Каждый элемент:



```json

{

&#x20; "name": "get\_open\_recommendations",

&#x20; "args": {

&#x20;   "limit": 5

&#x20; }

}

```



Если вопрос unsupported, `tool\_calls` должен быть пустым массивом:



```json

"tool\_calls": \[]

```



\---



\### `tool\_calls\[].name`



Тип: `string`

Обязательное поле.



Имя должно быть только из allowlist.



Planner не может придумывать новые tools.



\---



\### `tool\_calls\[].args`



Тип: `object`

Обязательное поле.



Аргументы должны соответствовать schema выбранного tool.



Planner не должен передавать:



\* `seller\_account\_id`;

\* `user\_id`;

\* SQL;

\* raw table names;

\* credentials;

\* write/action commands.



\---



\### `assumptions`



Тип: `array<string>`

Обязательное поле.



Содержит assumptions, которые Planner применил.



Примеры:



```json

\[

&#x20; "Период не указан, используется последние 30 дней.",

&#x20; "ABC-анализ строится по выручке.",

&#x20; "Категория определена по текстовому совпадению category\_hint."

]

```



Если assumptions нет:



```json

"assumptions": \[]

```



\---



\### `unsupported\_reason`



Тип: `string | null`

Обязательное поле.



Если вопрос поддерживается:



```json

"unsupported\_reason": null

```



Если вопрос unsupported:



```json

{

&#x20; "intent": "unsupported",

&#x20; "confidence": 0.92,

&#x20; "language": "ru",

&#x20; "tool\_calls": \[],

&#x20; "assumptions": \[],

&#x20; "unsupported\_reason": "Запрос требует изменения цены в Ozon, а AI-чат не выполняет auto-actions."

}

```



\---



\## Allowed tools



Planner может использовать только allowlisted backend tools.



MVP allowlist:



```text

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

```



Все tools:



\* read-only;

\* seller-scoped backend’ом;

\* ограничены по limit;

\* не возвращают raw database dump;

\* не выполняют действий в Ozon.



\---



\## Tool schemas



\### `get\_dashboard\_summary`



Назначение:



Получить общий summary кабинета:



\* revenue;

\* orders;

\* returns;

\* cancels;

\* freshness;

\* KPI deltas.



Allowed args:



```json

{

&#x20; "as\_of\_date": "YYYY-MM-DD | optional"

}

```



Default:



\* если `as\_of\_date` не указан, backend использует актуальную дату по данным.



Использовать для intents:



\* `priorities`;

\* `general\_overview`;

\* `sales`;

\* `recommendations`;

\* `alerts`.



\---



\### `get\_open\_recommendations`



Назначение:



Получить открытые AI-рекомендации.



Allowed args:



```json

{

&#x20; "limit": 5,

&#x20; "priority\_levels": \["critical", "high"],

&#x20; "horizon": "short\_term"

}

```



Allowed `priority\_levels`:



```text

critical

high

medium

low

```



Allowed `horizon`:



```text

short\_term

medium\_term

long\_term

```



Limits:



```text

default limit = 5

max limit = 10

```



Использовать для intents:



\* `priorities`;

\* `recommendations`;

\* `explain\_recommendation`;

\* `general\_overview`.



\---



\### `get\_recommendation\_detail`



Назначение:



Получить detail одной AI-рекомендации, включая related alerts.



Allowed args:



```json

{

&#x20; "recommendation\_id": 123

}

```



Требования:



\* `recommendation\_id` обязателен;

\* backend проверяет seller scope.



Использовать для intents:



\* `explain\_recommendation`;

\* `recommendations`.



\---



\### `get\_open\_alerts`



Назначение:



Получить открытые alert’ы.



Allowed args:



```json

{

&#x20; "limit": 10,

&#x20; "severities": \["critical", "high"],

&#x20; "groups": \["sales", "stock"]

}

```



Allowed `severities`:



```text

critical

high

medium

low

```



Allowed `groups`:



```text

sales

stock

advertising

price\_economics

```



Limits:



```text

default limit = 10

max limit = 20

```



Использовать для intents:



\* `alerts`;

\* `priorities`;

\* `unsafe\_ads`;

\* `ad\_loss`;

\* `stock`;

\* `pricing`;

\* `general\_overview`.



\---



\### `get\_alerts\_by\_group`



Назначение:



Получить alert’ы конкретной группы.



Allowed args:



```json

{

&#x20; "group": "advertising",

&#x20; "limit": 10

}

```



Allowed `group`:



```text

sales

stock

advertising

price\_economics

```



Limits:



```text

default limit = 10

max limit = 20

```



Использовать для intents:



\* `sales`;

\* `stock`;

\* `advertising`;

\* `pricing`;

\* `alerts`;

\* `unsafe\_ads`;

\* `ad\_loss`.



\---



\### `get\_critical\_skus`



Назначение:



Получить список critical SKU.



Allowed args:



```json

{

&#x20; "limit": 10,

&#x20; "as\_of\_date": "YYYY-MM-DD"

}

```



Limits:



```text

default limit = 10

max limit = 20

```



Использовать для intents:



\* `priorities`;

\* `stock`;

\* `sales`;

\* `general\_overview`.



\---



\### `get\_stock\_risks`



Назначение:



Получить stock/replenishment risks.



Allowed args:



```json

{

&#x20; "limit": 10,

&#x20; "as\_of\_date": "YYYY-MM-DD",

&#x20; "category\_hint": "Товары для дома"

}

```



Limits:



```text

default limit = 10

max limit = 20

```



Использовать для intents:



\* `stock`;

\* `unsafe\_ads`;

\* `priorities`;

\* `general\_overview`.



\---



\### `get\_advertising\_analytics`



Назначение:



Получить advertising analytics / ad risk context.



Allowed args:



```json

{

&#x20; "limit": 10,

&#x20; "date\_from": "YYYY-MM-DD",

&#x20; "date\_to": "YYYY-MM-DD",

&#x20; "campaign\_id": 123

}

```



Limits:



```text

default limit = 10

max limit = 20

default period = last 30 days

max period = 90 days

```



Использовать для intents:



\* `advertising`;

\* `ad\_loss`;

\* `unsafe\_ads`;

\* `priorities`;

\* `general\_overview`.



\---



\### `get\_price\_economics\_risks`



Назначение:



Получить price/economics risks через Alerts Engine.



Allowed args:



```json

{

&#x20; "limit": 10

}

```



Это semantic alias для:



```text

get\_alerts\_by\_group(group = "price\_economics")

```



Limits:



```text

default limit = 10

max limit = 20

```



Использовать для intents:



\* `pricing`;

\* `priorities`;

\* `general\_overview`.



\---



\### `get\_sku\_metrics`



Назначение:



Получить SKU metrics за период.



Allowed args:



```json

{

&#x20; "limit": 20,

&#x20; "date\_from": "YYYY-MM-DD",

&#x20; "date\_to": "YYYY-MM-DD",

&#x20; "category\_hint": "Товары для дома",

&#x20; "sku": 123456789,

&#x20; "offer\_id": "SKU-001",

&#x20; "sort\_by": "revenue"

}

```



Allowed `sort\_by`:



```text

revenue

orders

revenue\_delta

orders\_delta

contribution

```



Limits:



```text

default limit = 20

max limit = 50

default period = last 30 days

max period = 90 days

```



Использовать для intents:



\* `sales`;

\* `abc\_analysis`;

\* `stock`;

\* `pricing`;

\* `general\_overview`.



\---



\### `get\_sku\_context`



Назначение:



Получить расширенный context по конкретному SKU.



Allowed args:



```json

{

&#x20; "sku": 123456789,

&#x20; "offer\_id": "SKU-001"

}

```



Требование:



\* должен быть указан `sku` или `offer\_id`.



Возвращает:



\* product info;

\* sales metrics;

\* stock metrics;

\* price/economics context;

\* related alerts;

\* related recommendations.



Использовать для intents:



\* `explain\_recommendation`;

\* `sales`;

\* `stock`;

\* `pricing`;

\* `advertising`.



\---



\### `get\_campaign\_context`



Назначение:



Получить context по рекламной кампании.



Allowed args:



```json

{

&#x20; "campaign\_id": 123

}

```



Требование:



\* `campaign\_id` обязателен.



Возвращает:



\* spend;

\* revenue;

\* orders;

\* ROAS;

\* linked SKUs;

\* related alerts;

\* related recommendations.



Использовать для intents:



\* `advertising`;

\* `ad\_loss`;

\* `unsafe\_ads`.



\---



\### `run\_abc\_analysis`



Назначение:



Запустить deterministic backend ABC-анализ.



Allowed args:



```json

{

&#x20; "category\_hint": "Товары для дома",

&#x20; "date\_from": "YYYY-MM-DD",

&#x20; "date\_to": "YYYY-MM-DD",

&#x20; "metric": "revenue",

&#x20; "limit": 100

}

```



Allowed `metric`:



```text

revenue

orders

```



Limits:



```text

default limit = 100

max limit = 200

default period = last 30 days

max period = 90 days

```



Использовать для intents:



\* `abc\_analysis`.



Важно:



ABC-анализ считает backend.

Planner только выбирает tool и параметры.

ChatGPT не должен сам считать ABC из raw data.



\---



\## Default period rules



Если пользователь не указал период, Planner должен использовать default assumptions.



Default period для MVP:



```text

last 30 days

```



Для advertising, SKU metrics, ABC:



```text

date\_from = current\_date - 30 days

date\_to = current\_date

```



Max period:



```text

90 days

```



Если пользователь просит период больше max period, Planner должен:



\* либо ограничить период до 90 дней и добавить assumption;

\* либо вернуть unsupported\_reason, если вопрос требует полного периода.



Пример assumption:



```json

"assumptions": \[

&#x20; "Пользователь не указал период, используется последние 30 дней."

]

```



\---



\## Entity extraction rules



Planner может извлекать entity hints из вопроса:



\* `sku`;

\* `offer\_id`;

\* `product\_id`;

\* `campaign\_id`;

\* `recommendation\_id`;

\* `alert\_id`;

\* `category\_hint`.



Примеры:



Вопрос:



```text

Почему система советует снизить цену по SKU 123456789?

```



Tool call:



```json

{

&#x20; "name": "get\_sku\_context",

&#x20; "args": {

&#x20;   "sku": 123456789

&#x20; }

}

```



Вопрос:



```text

Объясни рекомендацию 55

```



Tool call:



```json

{

&#x20; "name": "get\_recommendation\_detail",

&#x20; "args": {

&#x20;   "recommendation\_id": 55

&#x20; }

}

```



Вопрос:



```text

Сделай ABC-анализ товаров из категории “Товары для дома”

```



Tool call:



```json

{

&#x20; "name": "run\_abc\_analysis",

&#x20; "args": {

&#x20;   "category\_hint": "Товары для дома",

&#x20;   "metric": "revenue",

&#x20;   "limit": 100

&#x20; }

}

```



\---



\## Recommended tool plans by intent



\### `priorities`



User asks:



```text

Какие 5 действий мне сделать сегодня?

```



Recommended plan:



```json

{

&#x20; "intent": "priorities",

&#x20; "confidence": 0.9,

&#x20; "language": "ru",

&#x20; "tool\_calls": \[

&#x20;   {

&#x20;     "name": "get\_open\_recommendations",

&#x20;     "args": {

&#x20;       "limit": 5,

&#x20;       "priority\_levels": \["critical", "high"]

&#x20;     }

&#x20;   },

&#x20;   {

&#x20;     "name": "get\_open\_alerts",

&#x20;     "args": {

&#x20;       "limit": 5,

&#x20;       "severities": \["critical", "high"]

&#x20;     }

&#x20;   },

&#x20;   {

&#x20;     "name": "get\_dashboard\_summary",

&#x20;     "args": {}

&#x20;   }

&#x20; ],

&#x20; "assumptions": \[],

&#x20; "unsupported\_reason": null

}

```



\---



\### `explain\_recommendation`



User asks:



```text

Почему система советует снизить цену по этому SKU?

```



Recommended plan:



```json

{

&#x20; "intent": "explain\_recommendation",

&#x20; "confidence": 0.75,

&#x20; "language": "ru",

&#x20; "tool\_calls": \[

&#x20;   {

&#x20;     "name": "get\_open\_recommendations",

&#x20;     "args": {

&#x20;       "limit": 10,

&#x20;       "priority\_levels": \["critical", "high", "medium"]

&#x20;     }

&#x20;   },

&#x20;   {

&#x20;     "name": "get\_price\_economics\_risks",

&#x20;     "args": {

&#x20;       "limit": 10

&#x20;     }

&#x20;   }

&#x20; ],

&#x20; "assumptions": \[

&#x20;   "Пользователь не указал конкретный SKU или recommendation\_id, будут использованы релевантные открытые рекомендации."

&#x20; ],

&#x20; "unsupported\_reason": null

}

```



If recommendation id is provided:



```json

{

&#x20; "intent": "explain\_recommendation",

&#x20; "confidence": 0.95,

&#x20; "language": "ru",

&#x20; "tool\_calls": \[

&#x20;   {

&#x20;     "name": "get\_recommendation\_detail",

&#x20;     "args": {

&#x20;       "recommendation\_id": 55

&#x20;     }

&#x20;   }

&#x20; ],

&#x20; "assumptions": \[],

&#x20; "unsupported\_reason": null

}

```



\---



\### `unsafe\_ads`



User asks:



```text

Какие товары сейчас опасно рекламировать?

```



Recommended plan:



```json

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

&#x20;   "Период не указан, используется последние 30 дней."

&#x20; ],

&#x20; "unsupported\_reason": null

}

```



\---



\### `ad\_loss`



User asks:



```text

Где я теряю деньги из-за рекламы?

```



Recommended plan:



```json

{

&#x20; "intent": "ad\_loss",

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

&#x20;     "name": "get\_alerts\_by\_group",

&#x20;     "args": {

&#x20;       "group": "advertising",

&#x20;       "limit": 10

&#x20;     }

&#x20;   }

&#x20; ],

&#x20; "assumptions": \[

&#x20;   "Период не указан, используется последние 30 дней."

&#x20; ],

&#x20; "unsupported\_reason": null

}

```



\---



\### `abc\_analysis`



User asks:



```text

Сделай ABC-анализ товаров из категории “Товары для дома”.

```



Recommended plan:



```json

{

&#x20; "intent": "abc\_analysis",

&#x20; "confidence": 0.92,

&#x20; "language": "ru",

&#x20; "tool\_calls": \[

&#x20;   {

&#x20;     "name": "run\_abc\_analysis",

&#x20;     "args": {

&#x20;       "category\_hint": "Товары для дома",

&#x20;       "metric": "revenue",

&#x20;       "limit": 100

&#x20;     }

&#x20;   }

&#x20; ],

&#x20; "assumptions": \[

&#x20;   "Период не указан, используется последние 30 дней.",

&#x20;   "ABC-анализ строится по выручке."

&#x20; ],

&#x20; "unsupported\_reason": null

}

```



\---



\### `pricing`



User asks:



```text

Есть ли проблемы с маржинальностью?

```



Recommended plan:



```json

{

&#x20; "intent": "pricing",

&#x20; "confidence": 0.86,

&#x20; "language": "ru",

&#x20; "tool\_calls": \[

&#x20;   {

&#x20;     "name": "get\_price\_economics\_risks",

&#x20;     "args": {

&#x20;       "limit": 10

&#x20;     }

&#x20;   },

&#x20;   {

&#x20;     "name": "get\_open\_recommendations",

&#x20;     "args": {

&#x20;       "limit": 10,

&#x20;       "priority\_levels": \["critical", "high", "medium"]

&#x20;     }

&#x20;   }

&#x20; ],

&#x20; "assumptions": \[],

&#x20; "unsupported\_reason": null

}

```



\---



\## Unsupported requests



Planner должен вернуть `intent = "unsupported"`, если вопрос требует того, что система не умеет или не должна делать.



Примеры unsupported:



```text

Измени цену по SKU 123 на 799 рублей.

```



```text

Останови все рекламные кампании с ROAS ниже 1.

```



```text

Создай поставку по товарам, которые скоро закончатся.

```



```text

Покажи данные другого магазина.

```



```text

Выгрузи все сырые заказы за год.

```



Response:



```json

{

&#x20; "intent": "unsupported",

&#x20; "confidence": 0.95,

&#x20; "language": "ru",

&#x20; "tool\_calls": \[],

&#x20; "assumptions": \[],

&#x20; "unsupported\_reason": "Запрос требует auto-action или доступа к данным, которые AI-чат не имеет права выполнять."

}

```



\---



\## Forbidden actions



Planner не может запрашивать tools или параметры, которые приводят к:



\* изменению цены;

\* изменению рекламного бюджета;

\* запуску рекламной кампании;

\* остановке рекламной кампании;

\* созданию поставки;

\* изменению карточки товара;

\* изменению pricing constraints;

\* закрытию alert’а;

\* принятию/отклонению рекомендации;

\* чтению данных другого seller account;

\* чтению raw orders/products/payloads;

\* выгрузке всех данных без лимита.



\---



\## Forbidden args



Planner не должен передавать следующие args:



```text

seller\_account\_id

user\_id

api\_key

token

authorization

password

secret

sql

raw\_query

table

database

```



Если такие args появились, backend validator должен отклонить tool plan.



\---



\## Limits



MVP limits:



```text

max tools per question = 5

default limit per tool = 10

max limit per tool = 20

max SKU metrics limit = 50

max ABC analysis limit = 200

default period = last 30 days

max period = 90 days

```



Planner должен использовать минимальный объём данных, достаточный для ответа.



\---



\## Strict JSON examples



\### Valid example



```json

{

&#x20; "intent": "priorities",

&#x20; "confidence": 0.91,

&#x20; "language": "ru",

&#x20; "tool\_calls": \[

&#x20;   {

&#x20;     "name": "get\_open\_recommendations",

&#x20;     "args": {

&#x20;       "limit": 5,

&#x20;       "priority\_levels": \["critical", "high"]

&#x20;     }

&#x20;   },

&#x20;   {

&#x20;     "name": "get\_open\_alerts",

&#x20;     "args": {

&#x20;       "limit": 5,

&#x20;       "severities": \["critical", "high"]

&#x20;     }

&#x20;   }

&#x20; ],

&#x20; "assumptions": \[],

&#x20; "unsupported\_reason": null

}

```



\### Invalid example: text outside JSON



```text

Конечно, я составлю план.



{

&#x20; "intent": "priorities"

}

```



Invalid because response contains text outside JSON.



\---



\### Invalid example: SQL



```json

{

&#x20; "intent": "sales",

&#x20; "confidence": 0.8,

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

```



Invalid because SQL tools are forbidden.



\---



\### Invalid example: seller account arg



```json

{

&#x20; "intent": "sales",

&#x20; "confidence": 0.8,

&#x20; "language": "ru",

&#x20; "tool\_calls": \[

&#x20;   {

&#x20;     "name": "get\_sku\_metrics",

&#x20;     "args": {

&#x20;       "seller\_account\_id": 10,

&#x20;       "limit": 20

&#x20;     }

&#x20;   }

&#x20; ],

&#x20; "assumptions": \[],

&#x20; "unsupported\_reason": null

}

```



Invalid because seller account is controlled by backend auth context.



\---



\## Backend validation responsibility



Even if Planner returns valid-looking JSON, backend must validate it.



Backend must reject:



\* invalid JSON;

\* missing required fields;

\* unknown intent;

\* unknown tool;

\* non-read-only tool;

\* forbidden args;

\* too many tools;

\* invalid enum values;

\* excessive limits;

\* excessive date range;

\* unsupported write/action requests.



Planner output is advisory, not authoritative.



\---



\## Trace requirements



Planner output must be stored in chat trace:



\* raw planner response;

\* parsed tool plan;

\* validated tool plan;

\* validation errors, if any;

\* prompt version;

\* model;

\* token usage;

\* status.



This is required for:



\* debugging;

\* audit;

\* support;

\* future admin tooling;

\* cost tracking.



\---



\## Final rule



Planner is allowed to decide \*\*what data is needed\*\*.



Planner is not allowed to decide \*\*how to access the database directly\*\*.



Correct pattern:



```text

Planner chooses allowed tools.

Backend validates.

Backend executes tools.

```



Incorrect pattern:



```text

Planner writes SQL.

Planner reads DB.

Planner performs actions.

```



```

```



