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

Потрібен Docker. Testcontainers автоматично піднімає PostgreSQL і Mailpit, запускає міграції, виконує тести і зупиняє контейнери.

```bash
npm run test:integration
```
