import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const chemin = (p) => fileURLToPath(new URL(p, import.meta.url));

// Pages du site de présentation (servies sur landing.<domaine>, voir nginx.conf).
// Clé = adresse publique, valeur = fichier source.
const PAGES_LANDING = {
  '/': 'landing/index.html',
  '/fonctionnement': 'landing/fonctionnement.html',
  '/gmq': 'landing/gmq.html',
};

/**
 * Pages du site : insère les blocs communs (<!-- inclure: entete -->) et marque
 * le lien de la page courante (aria-current) pour la navigation.
 */
function inclusionsLanding() {
  return {
    name: 'inclusions-landing',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!ctx.path.startsWith('/landing/')) return html;
        let sortie = html.replace(/<!-- inclure: ([\w-]+) -->/g, (_, nom) =>
          readFileSync(chemin(`./landing/partiels/${nom}.html`), 'utf-8')
        );
        const route = Object.keys(PAGES_LANDING).find((r) => `/${PAGES_LANDING[r]}` === ctx.path);
        if (route && route !== '/')
          sortie = sortie.replaceAll(`<a href="${route}">`, `<a href="${route}" aria-current="page">`);
        return sortie;
      },
    },
  };
}

/**
 * En dev, reproduit le routage nginx : http://landing.localhost:5173 sert le site,
 * et /connexion, /inscription renvoient vers l'application sur localhost.
 */
function routageLandingDev() {
  return {
    name: 'routage-landing-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const hote = req.headers.host || '';
        if (!hote.startsWith('landing.')) return next();
        const [chemin, requete = ''] = req.url.split('?');
        const appli = `http://${hote.slice('landing.'.length)}/`;
        if (chemin === '/connexion' || chemin === '/inscription') {
          res.statusCode = 302;
          res.setHeader('Location', chemin === '/inscription' ? `${appli}?inscription` : appli);
          return res.end();
        }
        if (PAGES_LANDING[chemin]) req.url = `/${PAGES_LANDING[chemin]}${requete ? `?${requete}` : ''}`;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), inclusionsLanding(), routageLandingDev()],
  build: {
    rollupOptions: {
      input: {
        main: chemin('./index.html'),
        ...Object.fromEntries(
          Object.values(PAGES_LANDING).map((f) => [f.replace(/\W+/g, '-').replace(/-html$/, ''), chemin(`./${f}`)])
        ),
      },
    },
  },
  server: {
    port: 5173,
    // Proxy des appels /api vers le backend Express
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
