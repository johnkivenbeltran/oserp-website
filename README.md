# OSERP Atelier

Mobile-first stationery storefront portfolio project.

## GitHub Pages

The `main` branch deploys the static frontend automatically through GitHub Actions. The published demo includes the storefront, product customizer, local cart, checkout preview, and local order details. The Node.js backend and admin page are intentionally not included in the Pages artifact, so server-backed order persistence, email, and admin actions require the local server.

To publish it:

1. Create a GitHub repository and push this project to its `main` branch.
2. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions**.
3. Push a change or run **Deploy frontend to GitHub Pages** from the **Actions** tab.

The site will be available at `https://<your-username>.github.io/<repository-name>/`.

## Local full-stack version

```text
npm install
npm start
```

Open `http://localhost:3000` to use the backend-backed cart and order flow.

Set `ADMIN_PASSWORD` before starting the server if you need the local admin page.