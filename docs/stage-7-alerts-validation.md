\# Stage 7. Alerts Engine — validation scenarios



\## Назначение документа



Этот документ фиксирует сценарии ручной и технической проверки stage 7: \*\*Alerts Engine\*\*.



Цель проверки — убедиться, что система:



\- запускает Alerts Engine для seller account;

\- создаёт alert’ы по продажам, остаткам, рекламе и ценовым ограничениям;

\- сохраняет evidence payload;

\- не создаёт дубли при повторном запуске;

\- корректно обрабатывает `dismiss` и `resolve`;

\- отображает alert’ы через API, Alerts screen и dashboard teaser.



Документ предназначен для dev / QA-проверки MVP-реализации stage 7.



\---



\## Предусловия



Перед проверкой stage 7 должны быть выполнены следующие условия:



\- backend запущен;

\- frontend запущен;

\- применены все миграции;

\- пользователь авторизован;

\- у пользователя есть seller account;

\- в системе есть данные по товарам, заказам, остаткам, рекламе и pricing constraints;

\- stage 3–6 уже выполнены;

\- endpoint `POST /api/v1/alerts/run` доступен;

\- экран `/app/alerts` доступен;

\- dashboard содержит alerts teaser.



\---



\## Основные API для проверки



\### Запуск Alerts Engine



```http

POST /api/v1/alerts/run

