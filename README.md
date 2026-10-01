# Light Photo Che

Сайт-портфоліо фотографа (Черкаси).

## Структура

```
src/
  index.html          розмітка сторінки
  css/
    main.css          точка входу — лише @import інших файлів
    variables.css     кольори (CSS-змінні)
    base.css          скидання стилів, body, секції, заголовки
    nav.css           верхнє меню
    hero.css          перший екран
    portfolio.css     сітка портфоліо і повзунок До/Після
    pricing.css       прайс
    workflow.css      таймлайн «Як я працюю»
    footer.css        контакти
    responsive.css    медіа-запити для планшетів і телефонів
  js/
    main.js           точка входу скриптів
    compare-slider.js логіка повзунка До/Після
  images/             локальні фото (стискаються під час збірки)
  public/             файли, що копіюються в корінь сайту як є (favicon, robots.txt, CNAME)
scripts/
  build.mjs           продакшн-збірка
  serve.mjs           локальний сервер
```

## Команди

Потрібен [Node.js](https://nodejs.org/) 20+.

```sh
npm install        # один раз — встановити залежності
npm run dev        # розробка: http://localhost:5173 (файли з src/ без змін)
npm run build      # продакшн-збірка в dist/
npm run preview    # зібрати і переглянути dist/ на http://localhost:4173
```

## Що робить `npm run build`

- **HTML** — мінімізує, прибирає коментарі, підставляє хешовані імена CSS/JS (скидання кешу браузера).
- **CSS** — склеює всі `@import` в один файл, мінімізує, додає вендорні префікси.
- **JS** — бандлить модулі в один файл і мінімізує.
- **Фото** з `src/images/` (JPG/PNG):
  - зменшує до 2000 px по ширині (менші не збільшує);
  - перестискає (JPEG — mozjpeg, якість 78);
  - видаляє EXIF-метадані (зокрема GPS);
  - створює WebP-версію, а `<img src="images/...">` у HTML автоматично обгортає в `<picture>`, щоб браузер брав WebP.

  Параметри якості та розміру — в `IMAGE` на початку `scripts/build.mjs`.

## Деплой

При пуші в `main` GitHub Actions (`.github/workflows/static.yml`) запускає `npm run build` і публікує `dist/` на GitHub Pages.
