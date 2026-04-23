## Stage 5 Advertising Signals v1

Короткая фиксация explainable rules-based сигналов для MVP.

### 1) Рост расхода без заметного результата

- **Имя сигнала:** `growth_without_result`
- **Входные поля:** `ad_metrics_daily.spend`, `ad_metrics_daily.orders_count` по кампании на диапазоне дат
- **Правило:** расход вырос >= 20% (вторая половина периода vs первая), а рост заказов < 5% или заказов нет в обеих половинах
- **Explanation:** "Кампания ускорила расход, но заказов практически не прибавилось"

### 2) Слабая эффективность кампании

- **Имя сигнала:** `weak_efficiency`
- **Входные поля:** `spend_total`, `revenue_total`, `orders_total`, `ctr`, `cpc`
- **Правило:** при `spend_total > 0` выполнено хотя бы одно: `orders_total = 0`, `revenue_total < spend_total`, `ctr < 0.5%`, `cpc > 60`
- **Explanation:** "Кампания тратит бюджет с низкой конверсией/отдачей"

### 3) Рекламируется товар с низким остатком

- **Имя сигнала:** `low_stock_advertised`
- **Входные поля:** `stock_available`, `days_of_cover`, campaign ↔ SKU link
- **Правило:** `stock_available <= 0` (critical) или `stock_available <= 3` / `days_of_cover <= 3` (low)
- **Explanation:** "SKU находится в рекламе при риске дефицита"

### 4) Бюджет тратится на SKU со слабой динамикой продаж

- **Имя сигнала:** `ad_spend_on_weak_sales_trend`
- **Входные поля:** `spend_per_sku`, `latest_sku_revenue`, `previous_sku_revenue`, `latest_orders`, `previous_orders`
- **Правило:** есть рекламный расход на SKU и динамика продаж слабая (`revenue` заметно падает или `orders` снижаются)
- **Explanation:** "Расход по SKU есть, но тренд продаж не поддерживает рекламные вложения"
