# Запуск тестів

## Підготовка

```bash
npm install
```

## Юніт-тести

Не потребують Docker або зовнішніх сервісів.

```bash
npm run test:unit
```

## Інтеграційні тести

Docker підіймає PostgreSQL і Mailpit автоматично, запускає тести і зупиняє контейнери.

```bash
npm run test:integration:docker
```
