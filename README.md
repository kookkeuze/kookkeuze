# Recepten Tool

Een web-applicatie voor het beheren van recepten met gebruikersauthenticatie.

## Database Setup

Deze applicatie gebruikt PostgreSQL voor persistente opslag van recepten en gebruikersgegevens.

### Voor lokale ontwikkeling:

1. Installeer PostgreSQL op je systeem
2. Maak een database aan: `createdb recipes`
3. Stel de DATABASE_URL environment variable in:
   ```
   DATABASE_URL=postgresql://localhost:5432/recipes
   ```

### Voor productie (Render):

1. Ga naar je Render dashboard
2. Maak een nieuwe PostgreSQL database service aan
3. Kopieer de connection string van de database
4. Voeg deze toe als environment variable in je web service:
   ```
   DATABASE_URL=postgresql://username:password@host:port/database
   ```

## Installatie

```bash
npm install
npm start
```

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key voor JWT tokens (optioneel, standaard: 'changeme-in-prod')
- `NODE_ENV`: Set naar 'production' voor productie

## Features

- Gebruikersregistratie en login
- Recepten toevoegen, bewerken en verwijderen
- Filteren op verschillende criteria
- Random recept generator
- Persistente opslag van alle gegevens 