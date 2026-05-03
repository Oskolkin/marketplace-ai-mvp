# Stage 8. AI Output Validation Guardrails

## Зачем нужен validator

Backend не должен доверять AI-ответу blindly.  
Даже при корректном prompt contract модель может вернуть:

- невалидный JSON;
- неизвестный `recommendation_type`;
- рекомендации с несуществующими entity/alert ссылками;
- действия, противоречащие pricing/stock/margin ограничениям.

Validator отсекает такие случаи до любого сохранения в БД.

## Что проверяет validator

`backend/internal/recommendations/validator.go` выполняет:

- parse и shape check (`{"recommendations":[...]}` или массив);
- required fields + enum checks;
- allowlist `recommendation_type`;
- required `supporting_metrics` (non-empty object);
- required `constraints_checked`/`constraints` (non-empty object, alias support);
- entity existence checks по входному `AIRecommendationContext`;
- `supporting_alert_ids` existence;
- `related_alert_types` consistency с context и related ids;
- evidence contradiction checks для ключевых recommendation типов;
- deterministic pricing guardrails (простые text triggers + numeric extraction);
- stock/ad guardrail (запрет на усиление рекламы при low stock signals);
- margin-risk guardrail (reject по expected margin thresholds и missing margin checks);
- sanitization (trim, caps, dedupe ids/types).

## Reject vs Warning

Validator разделяет результат на:

- `valid_recommendations`;
- `rejected_recommendations` с причиной.

Для части soft-несоответствий добавляются warnings, а confidence понижается:

- `high -> medium`
- `medium -> low`
- `low -> low`

Это позволяет не терять потенциально полезные рекомендации, но делать их менее приоритетными и более безопасными для последующих шагов.

## Источник данных для проверок

Validator работает только по:

- AI output;
- входному `AIRecommendationContext`.

На этапе validation он не ходит в БД и не вызывает внешние API.
