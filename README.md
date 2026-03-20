# Kookkeuze

Een web-applicatie voor het beheren van recepten met gebruikersauthenticatie.

## Stack

- Node.js + Express
- PostgreSQL
- Frontend statisch geserveerd vanuit dezelfde service

## Installatie (lokaal)

```bash
npm install
npm start
```

## Environment variables

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key voor JWT tokens
- `NODE_ENV`: `production` in productie
- `APP_BASE_URL`: Publieke URL van je backend (bijv. `https://www.kookkeuze.nl`)
- `FRONTEND_URL`: Publieke URL van je frontend (bijv. `https://www.kookkeuze.nl`)
- `CORS_ORIGINS`: Optioneel, comma-separated lijst van toegestane origins
- `BREVO_API_KEY`: Brevo API key (HTTPS mailverzending)
- `BREVO_FROM_EMAIL`: Optioneel, afzender e-mail (fallback: `SMTP_FROM` of `SMTP_USER`)
- `BREVO_FROM_NAME`: Optioneel, afzender naam (default: `Kookkeuze`)

## Railway deploy

1. Push deze code naar GitHub.
2. Maak in Railway een nieuw project aan vanaf je GitHub repo.
3. Voeg een PostgreSQL service toe in hetzelfde Railway project.
4. Zet de variabelen op je web service:
   - `DATABASE_URL` (uit Railway PostgreSQL)
   - `JWT_SECRET`
   - `NODE_ENV=production`
   - `APP_BASE_URL` (tijdelijk je Railway domein, later `https://www.kookkeuze.nl`)
   - `FRONTEND_URL` (tijdelijk je Railway domein, later `https://www.kookkeuze.nl`)
   - `CORS_ORIGINS` (bijv. `https://www.kookkeuze.nl,https://kookkeuze.nl,https://<jouw-service>.up.railway.app`)
   - `BREVO_API_KEY`
   - optioneel `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`
5. Deploy de service en controleer logs op:
   - `✅ Verbonden met PostgreSQL database.`
   - `🌐 CORS origins: ...`

## Notes

- De frontend gebruikt standaard dezelfde origin als de backend (`window.location.origin`) en is daardoor platform-onafhankelijk (Render/Railway).
- De database-initialisatie maakt tabellen automatisch aan als ze nog niet bestaan.
