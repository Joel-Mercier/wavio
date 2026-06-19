import { GITHUB_URL } from '../consts'

export const languages = {
  en: 'English',
  fr: 'Français',
} as const

export type Lang = keyof typeof languages

export const defaultLang: Lang = 'en'

export const ui = {
  en: {
    meta: {
      homeTitle: 'Wavio. Your music, your player, your way.',
      homeDescription:
        'A open-source Android music player for Navidrome, Jellyfin and OpenSubsonic servers or a local library. No ads, no tracking, fully offline-ready.',
      privacyTitle: 'Privacy Policy. Wavio',
      privacyDescription:
        "Wavio runs entirely on your device and talks only to the music server you configure. We don't collect, sell, or share your data.",
    },
    nav: {
      features: 'Features',
      github: 'GitHub',
      download: 'Download',
    },
    hero: {
      tag: 'A open-source music player',
      titleLines: [
        ['Your', 'music,'],
        ['your', 'player,'],
      ],
      titleAccent: 'your way.',
      lead: 'A Android music player for Navidrome, Jellyfin and OpenSubsonic servers or a local library. Built for people who own their library and want it to feel like home.',
    },
    cta: {
      releaseMain: 'Get latest release',
      releaseNote: 'Coming soon on Google Play',
      starGithub: 'View on GitHub',
      viewSource: 'View source',
    },
    highlightsLabel: 'What you get',
    highlights: [
      'Open source, MIT licensed',
      'No ads, ever',
      'No tracking, no telemetry',
      'Works fully offline',
      'Android Auto ready',
      'Navidrome, Jellyfin & OpenSubsonic, local library',
    ],
    features: {
      headingPre: 'A player that',
      headingEm: 'respects',
      headingPost: 'your library.',
      sub: 'Every screen is built for the way you actually listen. Fast, quiet, and entirely on your terms.',
      home: {
        label: 'Home',
        title: 'Your library, beautifully sorted.',
        desc: 'Recently played, recently added, most played and internet radio, all on one calm home screen.',
      },
      audiophile: {
        label: 'Audiophile',
        title: 'Tuned, not loud.',
        desc: 'Gapless, crossfade, replay gain, system EQ.',
      },
      offline: { label: 'Offline', title: 'Take it off the grid.' },
      quote: {
        label: 'No strings',
        title: 'No ads. No accounts. No tracking. The way music apps used to be.',
      },
      playlists: { label: 'Playlists', title: 'Smart rules, full control.' },
      auto: { label: 'In the car', title: 'Android Auto, built in.' },
      queue: {
        label: 'Queue',
        title: 'A queue you actually control.',
        desc: 'Reorder, edit, clear. Save the current queue as a playlist with one tap.',
      },
      servers: {
        label: 'Servers',
        title: 'Switch backends in one tap.',
        desc: "Run Navidrome at home, Jellyfin at a friend's, OpenSubsonic somewhere else and even a local library for backup. One app for all of them.",
      },
      sleep: {
        label: 'Sleep timer',
        title: 'Fade gracefully.',
        desc: 'Schedule a soft fade-out so your favorite album can carry you under.',
      },
      podcasts: {
        label: 'Podcasts',
        title: 'Learn something everywhere you go.',
        desc: 'Search, follow and play podcasts powered by Taddy. Your tracks and your shows, under one roof.',
      },
      radio: {
        label: 'Internet radio',
        title: 'Tune in, anywhere.',
        desc: 'Stream the internet radio stations from your server in a tap. Browse, save, and listen live.',
      },
      lyrics: {
        label: 'Lyrics',
        title: 'Sing along, in sync.',
        desc: 'Synchronised lyrics from LRCLib, scrolling line by line with the track.',
      },
      widgets: {
        label: 'Home screen widgets',
        title: 'A glance away.',
        desc: 'Now playing and recently played, right on your Android home screen. No need to open the app.',
      },
    },
    showcase: {
      headingPre: 'Every screen,',
      headingEm: 'just right.',
      sub: 'Views built around what you do most. Browse, play, queue, tune, download, and forget the app is even there.',
    },
    final: {
      titleL1: 'Bring your music',
      titleEm: 'back home.',
      desc: 'Free, open-source, and built by people who think your library should belong to you.',
    },
    footer: {
      tagline:
        'A open-source music player for Android. Compatible with Navidrome, Jellyfin and OpenSubsonic or a local library.',
      product: 'Product',
      features: 'Features',
      download: 'Download',
      changelog: 'Changelog',
      openSource: 'Open Source',
      github: 'GitHub',
      legal: 'Legal',
      privacy: 'Privacy',
      copyright: '© 2026 Joel Mercier',
      madeWith: 'Made with Astro and TailwindCSS. Hosted on Vercel. All texts use the Inter font.',
    },
    privacy: {
      back: 'Back to home',
      titlePre: 'Privacy, the',
      titleEm: 'boring kind.',
      updated: 'Last updated May 27, 2026',
      readTime: '5 minute read',
      summaryLabel: 'In one sentence',
      summary:
        "Wavio runs entirely on your device and talks only to the music server you configure. We don't collect, sell, or share your data, because we don't have it.",
      sections: [
        {
          num: '01',
          title: 'Who we are',
          body: `<p>Wavio is a free, open-source Android application maintained by independent contributors. The source code is published under the MIT license and available for anyone to inspect on <a href="${GITHUB_URL}" target="_blank" rel="noopener" class="text-accent hover:underline">GitHub</a>.</p>`,
        },
        {
          num: '02',
          title: 'What Wavio collects about you',
          body: `<p><strong>Nothing personal.</strong> Wavio has no accounts, no profiles, no advertising SDKs, no behavioural analytics, and no social trackers. We do not operate any server that stores who you are or what you listen to.</p>
						<p>The only data leaving your phone is what's needed to play music or to help us diagnose crashes, described in the next two sections.</p>`,
        },
        {
          num: '03',
          title: 'What stays on your device',
          body: `<p>To work as a music player, Wavio stores the following locally, on your phone only:</p>
					<ul>
						<li>Server connection details (URL, username, and an encrypted password or token) for each server you add.</li>
						<li>Your playback queue, recently played and recently searched items, sleep timer and equalizer settings, and other app preferences.</li>
						<li>Tracks you choose to download for offline listening, plus cached album art and metadata fetched from your server.</li>
							<li>Podcast API credentials (Taddy) if you enable podcasts.</li>
					</ul>
					<p>This information lives in app-private storage. Uninstalling Wavio removes all of it.</p>`,
        },
        {
          num: '04',
          title: 'What your music server sees',
          body: `<p>When you connect Wavio to a Navidrome, Jellyfin, or OpenSubsonic instance, the app communicates directly with that server using the credentials you provide. The server will typically log your IP address, the requests you make, and your listening activity, just like any other client would.</p>
						<p>Wavio's contributors do not operate those servers and have no access to what they log.</p>
					<p>Please consult the privacy policy of the server you connect to.</p>`,
        },
        {
          num: '05',
          title: 'Crash and error reporting',
          body: `<p>Production builds of Wavio use <a href="https://sentry.io/" target="_blank" rel="noopener" class="text-accent hover:underline">Sentry</a> to report crashes and unexpected errors so we can fix them. Each report includes technical context such as a stack trace, the app version, the device model, the Android version, and the IP address that delivered the report.</p>
						<p>We do not assign you an identifier, do not track which screens you visit, do not log what you listen to, and do not build a profile of you. Reports are used only to diagnose bugs and are retained according to <a href="https://sentry.io/privacy/" target="_blank" rel="noopener" class="text-accent hover:underline">Sentry's data retention policy</a>.</p>`,
        },
        {
          num: '06',
          title: 'Android permissions',
          body: `<p>Wavio requests only the permissions it needs to play music:</p>
					<ul>
						<li><strong>Internet</strong> to reach your music server and the third-party services listed below.</li>
						<li><strong>Foreground service and media playback</strong> to keep audio playing when the screen is off.</li>
						<li><strong>Notifications</strong> to display playback controls on the lock screen and in the notification shade.</li>
							<li><strong>Modify audio settings</strong> to apply the system equalizer.</li>
						<li><strong>Read media audio and storage</strong> to save and read downloaded tracks for offline playback.</li>
							<li><strong>Vibration</strong> for subtle haptic feedback on certain controls.</li>
						</ul>
						<p>Wavio does not request access to your contacts, your precise location, the camera, or any other sensitive data.</p>`,
        },
        {
          num: '07',
          title: 'Third-party services',
          body: `<p>Beyond your music server and Sentry, Wavio talks to a small number of external services, and only when the corresponding feature is used:</p>
						<ul>
							<li><strong><a href="https://lrclib.net/" target="_blank" rel="noopener" class="text-accent hover:underline">LRCLib</a></strong> is queried for synchronised lyrics when you open the lyrics view for a track.</li>
							<li><strong><a href="https://taddy.org/" target="_blank" rel="noopener" class="text-accent hover:underline">Taddy</a></strong> powers podcast search and metadata, and is only contacted if you provide your own Taddy API key and user ID in the settings.</li>
							<li><strong><a href="https://www.radio-browser.info/" target="_blank" rel="noopener" class="text-accent hover:underline">Radio Browser</a></strong> provides the internet radio station directory, and is queried when you browse or search for radio stations.</li>
							<li><strong>Google Cast</strong> is used when you cast playback to a Chromecast-compatible device. Google's terms then apply to that session.</li>
						</ul>
						<p>No advertising network, no analytics provider, and no social tracker is integrated into Wavio.</p>`,
        },
        {
          num: '08',
          title: 'Children',
          body: `<p>Wavio is suitable for users of all ages and does not knowingly collect any information about anyone, including children.</p>`,
        },
        {
          num: '09',
          title: 'Changes to this policy',
          body: `<p>If this policy ever changes, the updated version will be published here and announced in the project's release notes on GitHub.</p>`,
        },
        {
          num: '10',
          title: 'Contact',
          body: `<p>Questions, concerns, or curiosity? Open an issue on <a href="${GITHUB_URL}/issues" target="_blank" rel="noopener" class="text-accent hover:underline">the Wavio GitHub repository</a> and a maintainer will get back to you.</p>`,
        },
      ],
    },
  },

  fr: {
    meta: {
      homeTitle: 'Wavio. Votre musique, votre lecteur, à votre façon.',
      homeDescription:
        'Un lecteur de musique Android open source pour Navidrome, Jellyfin et OpenSubsonic ou une bibliothèque locale. Sans publicité, sans pistage, entièrement utilisable hors ligne.',
      privacyTitle: 'Politique de confidentialité. Wavio',
      privacyDescription:
        "Wavio fonctionne entièrement sur votre appareil et ne communique qu'avec le serveur de musique que vous configurez. Nous ne collectons, ne vendons ni ne partageons vos données.",
    },
    nav: {
      features: 'Fonctionnalités',
      github: 'GitHub',
      download: 'Télécharger',
    },
    hero: {
      tag: 'Un lecteur de musique open source',
      titleLines: [
        ['Votre', 'musique,'],
        ['votre', 'lecteur,'],
      ],
      titleAccent: 'à votre façon.',
      lead: "Un lecteur de musique Android pour Navidrome, Jellyfin et OpenSubsonic ou une bibliothèque locale. Conçu pour celles et ceux qui possèdent leur bibliothèque et veulent qu'elle se sente comme chez soi.",
    },
    cta: {
      releaseMain: 'Dernière version',
      releaseNote: 'Bientôt sur Google Play',
      starGithub: 'Voir sur GitHub',
      viewSource: 'Voir le code source',
    },
    highlightsLabel: 'Ce que vous obtenez',
    highlights: [
      'Open source, sous licence MIT',
      'Sans publicité, pour toujours',
      'Sans pistage, sans télémétrie',
      'Fonctionne entièrement hors ligne',
      'Compatible Android Auto',
      'Navidrome, Jellyfin et OpenSubsonic',
    ],
    features: {
      headingPre: 'Un lecteur qui',
      headingEm: 'respecte',
      headingPost: 'votre bibliothèque.',
      sub: "Chaque écran est pensé pour votre façon d'écouter. Rapide, discret, et entièrement selon vos règles.",
      home: {
        label: 'Accueil',
        title: 'Votre bibliothèque, parfaitement rangée.',
        desc: "Écoutes récentes, ajouts récents, les plus écoutés et radio internet, le tout sur un écran d'accueil apaisant.",
      },
      audiophile: {
        label: 'Audiophile',
        title: 'Accordé, pas juste fort.',
        desc: 'Sans blanc, fondu enchaîné, replay gain, égaliseur système.',
      },
      offline: { label: 'Hors ligne', title: 'Emportez-la partout.' },
      quote: {
        label: 'Sans contrainte',
        title: "Sans publicité. Sans compte. Sans pistage. Comme les applis de musique d'avant.",
      },
      playlists: {
        label: 'Playlists',
        title: 'Règles intelligentes, contrôle total.',
      },
      auto: { label: 'En voiture', title: 'Android Auto, intégré.' },
      queue: {
        label: "File d'attente",
        title: 'Une file que vous maîtrisez vraiment.',
        desc: "Réorganisez, modifiez, videz. Enregistrez la file actuelle comme playlist d'un seul geste.",
      },
      servers: {
        label: 'Serveurs',
        title: "Changez de serveur d'un geste.",
        desc: 'Navidrome à la maison, Jellyfin chez un ami, OpenSubsonic ailleurs et madeWithout ou une bibliothèque locale comme solution de secours. Une seule appli pour tous.',
      },
      sleep: {
        label: 'Minuterie',
        title: 'Une extinction tout en douceur.',
        desc: 'Programmez un fondu en sortie pour que votre album préféré vous accompagne jusqu’au sommeil.',
      },
      podcasts: {
        label: 'Podcasts',
        title: 'Vos émissions, où que vous soyez.',
        desc: "Cherchez, suivez et écoutez des podcasts grâce à Taddy. Vos morceaux et vos émissions, sous un seul toit.",
      },
      radio: {
        label: 'Radio en ligne',
        title: 'Branchez-vous, partout.',
        desc: "Écoutez les stations de radio en ligne de votre serveur en un geste. Parcourez, enregistrez, écoutez en direct.",
      },
      lyrics: {
        label: 'Paroles',
        title: 'Chantez, en rythme.',
        desc: 'Paroles synchronisées depuis LRCLib, défilant ligne par ligne avec le morceau.',
      },
      widgets: {
        label: "Widgets d'accueil",
        title: "À portée d'œil.",
        desc: "Lecture en cours et écoutes récentes, directement sur votre écran d'accueil Android. Sans ouvrir l'appli.",
      },
    },
    showcase: {
      headingPre: 'Chaque écran,',
      headingEm: 'au bon endroit.',
      sub: "Des vues pensées autour de ce que vous faites le plus. Parcourir, écouter, gérer la file, régler, télécharger, et oublier que l'appli est là.",
    },
    final: {
      titleL1: 'Ramenez votre musique',
      titleEm: 'à la maison.',
      desc: 'Gratuit, open source, et conçu par des gens convaincus que votre bibliothèque vous appartient.',
    },
    footer: {
      tagline:
        'Un lecteur de musique open source pour Android. Compatible avec Navidrome, Jellyfin et OpenSubsonic ou une bibliothèque locale.',
      product: 'Produit',
      features: 'Fonctionnalités',
      download: 'Télécharger',
      changelog: 'Journal des modifications',
      openSource: 'Open source',
      github: 'GitHub',
      legal: 'Mentions légales',
      privacy: 'Confidentialité',
      copyright: '© 2026 Joel Mercier',
      madeWith: "Construit avec Astro et TailwindCSS. Hébergé chez Vercel. Tous les textes utilisent le police d'écriture Inter.",
    },
    privacy: {
      back: "Retour à l'accueil",
      titlePre: 'La confidentialité,',
      titleEm: 'version ennuyeuse.',
      updated: 'Dernière mise à jour le 27 mai 2026',
      readTime: '5 minutes de lecture',
      summaryLabel: 'En une phrase',
      summary:
        "Wavio fonctionne entièrement sur votre appareil et ne communique qu'avec le serveur de musique que vous configurez. Nous ne collectons, ne vendons ni ne partageons vos données, parce que nous ne les avons pas.",
      sections: [
        {
          num: '01',
          title: 'Qui nous sommes',
          body: `<p>Wavio est une application Android gratuite et open source, maintenue par des contributeurs indépendants. Le code source est publié sous licence MIT et consultable par tout le monde sur <a href="${GITHUB_URL}" target="_blank" rel="noopener" class="text-accent hover:underline">GitHub</a>.</p>`,
        },
        {
          num: '02',
          title: 'Ce que Wavio collecte sur vous',
          body: `<p><strong>Rien de personnel.</strong> Wavio n'a pas de comptes, pas de profils, pas de SDK publicitaires, pas de statistiques comportementales et pas de traceurs sociaux. Nous n'exploitons aucun serveur qui stockerait qui vous êtes ou ce que vous écoutez.</p>
						<p>Les seules données qui quittent votre téléphone sont celles nécessaires à la lecture de la musique ou au diagnostic des plantages, décrites dans les deux sections suivantes.</p>`,
        },
        {
          num: '03',
          title: 'Ce qui reste sur votre appareil',
          body: `<p>Pour fonctionner comme lecteur de musique, Wavio enregistre localement, sur votre téléphone :</p>
					<ul>
						<li>Les informations de connexion (URL, nom d'utilisateur et mot de passe ou jeton chiffré) de chaque serveur que vous ajoutez.</li>
						<li>Votre file d'attente, vos éléments récemment écoutés et recherchés, vos réglages de minuterie et d'égaliseur, et les autres préférences de l'application.</li>
						<li>Les morceaux que vous choisissez de télécharger pour l'écoute hors ligne, ainsi que les pochettes et métadonnées mises en cache depuis votre serveur.</li>
							<li>Les identifiants d'API de podcasts (Taddy) si vous activez les podcasts.</li>
					</ul>
					<p>Ces informations résident dans le stockage privé de l'application. Désinstaller Wavio les supprime toutes.</p>`,
        },
        {
          num: '04',
          title: 'Ce que voit votre serveur de musique',
          body: `<p>Lorsque vous connectez Wavio à une instance Navidrome, Jellyfin ou OpenSubsonic, l'application communique directement avec ce serveur à l'aide des identifiants que vous fournissez. Le serveur enregistre généralement votre adresse IP, les requêtes que vous effectuez et votre activité d'écoute, comme le ferait n'importe quel autre client.</p>
						<p>Les contributeurs de Wavio n'exploitent pas ces serveurs et n'ont accès à rien de ce qu'ils journalisent.</p>
					<p>Veuillez consulter la politique de confidentialité du serveur auquel vous vous connectez.</p>`,
        },
        {
          num: '05',
          title: 'Rapports de plantage et erreurs',
          body: `<p>Les versions de production de Wavio utilisent <a href="https://sentry.io/" target="_blank" rel="noopener" class="text-accent hover:underline">Sentry</a> pour remonter les plantages et erreurs inattendues afin que nous puissions les corriger. Chaque rapport inclut un contexte technique : trace d'appels, version de l'application, modèle d'appareil, version d'Android, et l'adresse IP ayant transmis le rapport.</p>
						<p>Nous ne vous attribuons aucun identifiant, ne suivons pas les écrans que vous visitez, n'enregistrons pas ce que vous écoutez et ne construisons aucun profil de vous. Les rapports servent uniquement au diagnostic des bugs et sont conservés selon la <a href="https://sentry.io/privacy/" target="_blank" rel="noopener" class="text-accent hover:underline">politique de rétention de Sentry</a>.</p>`,
        },
        {
          num: '06',
          title: 'Autorisations Android',
          body: `<p>Wavio ne demande que les autorisations nécessaires à la lecture de musique :</p>
					<ul>
						<li><strong>Internet</strong> pour joindre votre serveur de musique et les services tiers listés ci-dessous.</li>
						<li><strong>Service en premier plan et lecture multimédia</strong> pour continuer la lecture écran éteint.</li>
						<li><strong>Notifications</strong> pour afficher les commandes de lecture sur l'écran de verrouillage et dans le volet de notifications.</li>
							<li><strong>Modification des réglages audio</strong> pour appliquer l'égaliseur système.</li>
						<li><strong>Lecture des médias audio et stockage</strong> pour enregistrer et lire les morceaux téléchargés pour l'écoute hors ligne.</li>
							<li><strong>Vibration</strong> pour un retour haptique discret sur certaines commandes.</li>
						</ul>
						<p>Wavio ne demande pas l'accès à vos contacts, à votre localisation précise, à la caméra ni à aucune autre donnée sensible.</p>`,
        },
        {
          num: '07',
          title: 'Services tiers',
          body: `<p>En dehors de votre serveur de musique et de Sentry, Wavio communique avec un petit nombre de services externes, uniquement lorsque la fonctionnalité correspondante est utilisée :</p>
						<ul>
							<li><strong><a href="https://lrclib.net/" target="_blank" rel="noopener" class="text-accent hover:underline">LRCLib</a></strong> est interrogé pour récupérer les paroles synchronisées lorsque vous ouvrez la vue des paroles d'un morceau.</li>
							<li><strong><a href="https://taddy.org/" target="_blank" rel="noopener" class="text-accent hover:underline">Taddy</a></strong> alimente la recherche et les métadonnées de podcasts, et n'est contacté que si vous fournissez votre propre clé d'API et identifiant utilisateur Taddy dans les réglages.</li>
							<li><strong><a href="https://www.radio-browser.info/" target="_blank" rel="noopener" class="text-accent hover:underline">Radio Browser</a></strong> fournit l'annuaire des stations de radio en ligne, et est interrogé lorsque vous parcourez ou recherchez des stations de radio.</li>
							<li><strong>Google Cast</strong> est utilisé lorsque vous diffusez la lecture vers un appareil compatible Chromecast. Les conditions de Google s'appliquent alors à cette session.</li>
						</ul>
						<p>Aucun réseau publicitaire, fournisseur de statistiques ou traceur social n'est intégré à Wavio.</p>`,
        },
        {
          num: '08',
          title: 'Enfants',
          body: `<p>Wavio convient à tous les âges et ne collecte sciemment aucune information sur quiconque, y compris les enfants.</p>`,
        },
        {
          num: '09',
          title: 'Modifications de cette politique',
          body: `<p>Si cette politique venait à changer, la version mise à jour sera publiée ici et annoncée dans les notes de version du projet sur GitHub.</p>`,
        },
        {
          num: '10',
          title: 'Contact',
          body: `<p>Une question, une inquiétude ou de la curiosité ? Ouvrez un ticket sur <a href="${GITHUB_URL}/issues" target="_blank" rel="noopener" class="text-accent hover:underline">le dépôt GitHub de Wavio</a> et un mainteneur vous répondra.</p>`,
        },
      ],
    },
  },
} as const
