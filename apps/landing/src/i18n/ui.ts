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
      homeTitle: 'Wavio. Your music, your server, your way.',
      homeDescription:
        'An open-source Android music player for Navidrome, Jellyfin and OpenSubsonic. No ads, no tracking, fully offline-ready.',
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
      tag: 'An open-source music player',
      titleLines: [
        ['Your', 'music,'],
        ['your', 'server,'],
      ],
      titleAccent: 'your way.',
      lead: 'An Android player for Navidrome, Jellyfin and OpenSubsonic. Built for people who own their library and want it to feel like home.',
    },
    cta: {
      getItOn: 'GET IT ON',
      googlePlay: 'Google Play',
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
      'Navidrome, Jellyfin & OpenSubsonic',
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
        desc: "Run Navidrome at home, Jellyfin at a friend's, OpenSubsonic somewhere else. One app for all of them.",
      },
      sleep: {
        label: 'Sleep timer',
        title: 'Fade gracefully.',
        desc: 'Schedule a soft fade-out so your favorite album can carry you under.',
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
        'An open-source music player for Android. For Navidrome, Jellyfin and OpenSubsonic.',
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
          body: `<p>Wavio is a free, open-source Android application maintained by independent contributors. The source code is published under the MIT license and available for anyone to inspect.</p>`,
        },
        {
          num: '02',
          title: 'What data Wavio collects',
          body: `<p><strong>None.</strong> Wavio does not collect, transmit, or store any personal information on any server we operate. We do not run analytics, telemetry, advertising SDKs, or crash reporting services.</p>`,
        },
        {
          num: '03',
          title: 'What stays on your device',
          body: `<p>To work as a music player, Wavio stores the following locally on your phone:</p>
					<ul>
						<li>Server connection details (URL, username, and an encrypted credential) for the servers you choose to connect to.</li>
						<li>Your playback settings, queue, listening history, and downloaded tracks.</li>
						<li>Cached album art and metadata fetched from your server.</li>
					</ul>
					<p>This information never leaves your device. Uninstalling Wavio removes it.</p>`,
        },
        {
          num: '04',
          title: 'What your music server sees',
          body: `<p>When you connect Wavio to a Navidrome, Jellyfin, or OpenSubsonic instance, the app communicates directly with that server using the credentials you provide. Wavio's contributors do not operate those servers and have no access to anything they log.</p>
					<p>Please consult the privacy policy of the server you connect to for information on what it records.</p>`,
        },
        {
          num: '05',
          title: 'Permissions',
          body: `<p>Wavio requests only the permissions it needs to play music:</p>
					<ul>
						<li><strong>Internet access</strong> to reach your music server.</li>
						<li><strong>Foreground service and media playback</strong> to keep playing when the screen is off.</li>
						<li><strong>Notifications</strong> to display playback controls.</li>
						<li><strong>Storage</strong> for offline downloads, when you choose to download tracks.</li>
					</ul>`,
        },
        {
          num: '06',
          title: 'Third-party services',
          body: `<p>Wavio does not integrate any third-party analytics, advertising networks, or social trackers. The only external services contacted are the music servers you configure and, when available, MusicBrainz or Last.fm endpoints for optional metadata enrichment, both initiated by your explicit action.</p>`,
        },
        {
          num: '07',
          title: 'Children',
          body: `<p>Wavio is suitable for users of all ages and does not knowingly collect any information about anyone, including children.</p>`,
        },
        {
          num: '08',
          title: 'Changes to this policy',
          body: `<p>If this policy ever changes, the updated version will be published here and announced in the project's release notes on GitHub.</p>`,
        },
        {
          num: '09',
          title: 'Contact',
          body: `<p>Questions, concerns, or curiosity? Open an issue on <a href="${GITHUB_URL}/issues" target="_blank" rel="noopener" class="text-accent hover:underline">the Wavio GitHub repository</a> and a maintainer will get back to you.</p>`,
        },
      ],
    },
  },

  fr: {
    meta: {
      homeTitle: 'Wavio. Votre musique, votre serveur, à votre façon.',
      homeDescription:
        'Un lecteur de musique Android open source pour Navidrome, Jellyfin et OpenSubsonic. Sans publicité, sans pistage, entièrement utilisable hors ligne.',
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
        ['votre', 'serveur,'],
      ],
      titleAccent: 'à votre façon.',
      lead: "Un lecteur Android pour Navidrome, Jellyfin et OpenSubsonic. Conçu pour celles et ceux qui possèdent leur bibliothèque et veulent qu'elle se sente comme chez soi.",
    },
    cta: {
      getItOn: 'DISPONIBLE SUR',
      googlePlay: 'Google Play',
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
        desc: 'Navidrome à la maison, Jellyfin chez un ami, OpenSubsonic ailleurs. Une seule appli pour tous.',
      },
      sleep: {
        label: 'Minuterie',
        title: 'Une extinction tout en douceur.',
        desc: 'Programmez un fondu en sortie pour que votre album préféré vous accompagne jusqu’au sommeil.',
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
        'Un lecteur de musique open source pour Android. Pour Navidrome, Jellyfin et OpenSubsonic.',
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
          body: `<p>Wavio est une application Android gratuite et open source, maintenue par des contributeurs indépendants. Le code source est publié sous licence MIT et consultable par tout le monde.</p>`,
        },
        {
          num: '02',
          title: 'Quelles données Wavio collecte',
          body: `<p><strong>Aucune.</strong> Wavio ne collecte, ne transmet ni ne stocke aucune information personnelle sur un serveur que nous exploitons. Nous n'utilisons ni statistiques, ni télémétrie, ni SDK publicitaire, ni service de rapport de plantage.</p>`,
        },
        {
          num: '03',
          title: 'Ce qui reste sur votre appareil',
          body: `<p>Pour fonctionner comme lecteur de musique, Wavio enregistre localement, sur votre téléphone :</p>
					<ul>
						<li>Les informations de connexion (URL, nom d'utilisateur et identifiant chiffré) des serveurs auxquels vous choisissez de vous connecter.</li>
						<li>Vos réglages de lecture, votre file d'attente, votre historique d'écoute et vos morceaux téléchargés.</li>
						<li>Les pochettes et métadonnées mises en cache depuis votre serveur.</li>
					</ul>
					<p>Ces informations ne quittent jamais votre appareil. Désinstaller Wavio les supprime.</p>`,
        },
        {
          num: '04',
          title: 'Ce que voit votre serveur de musique',
          body: `<p>Lorsque vous connectez Wavio à une instance Navidrome, Jellyfin ou OpenSubsonic, l'application communique directement avec ce serveur à l'aide des identifiants que vous fournissez. Les contributeurs de Wavio n'exploitent pas ces serveurs et n'ont accès à rien de ce qu'ils journalisent.</p>
					<p>Veuillez consulter la politique de confidentialité du serveur auquel vous vous connectez pour savoir ce qu'il enregistre.</p>`,
        },
        {
          num: '05',
          title: 'Autorisations',
          body: `<p>Wavio ne demande que les autorisations nécessaires à la lecture de musique :</p>
					<ul>
						<li><strong>Accès à Internet</strong> pour joindre votre serveur de musique.</li>
						<li><strong>Service en premier plan et lecture multimédia</strong> pour continuer la lecture écran éteint.</li>
						<li><strong>Notifications</strong> pour afficher les commandes de lecture.</li>
						<li><strong>Stockage</strong> pour les téléchargements hors ligne, lorsque vous choisissez de télécharger des morceaux.</li>
					</ul>`,
        },
        {
          num: '06',
          title: 'Services tiers',
          body: `<p>Wavio n'intègre aucun service tiers de statistiques, réseau publicitaire ou traceur social. Les seuls services externes contactés sont les serveurs de musique que vous configurez et, le cas échéant, les API MusicBrainz ou Last.fm pour un enrichissement facultatif des métadonnées, toujours à votre initiative explicite.</p>`,
        },
        {
          num: '07',
          title: 'Enfants',
          body: `<p>Wavio convient à tous les âges et ne collecte sciemment aucune information sur quiconque, y compris les enfants.</p>`,
        },
        {
          num: '08',
          title: 'Modifications de cette politique',
          body: `<p>Si cette politique venait à changer, la version mise à jour sera publiée ici et annoncée dans les notes de version du projet sur GitHub.</p>`,
        },
        {
          num: '09',
          title: 'Contact',
          body: `<p>Une question, une inquiétude ou de la curiosité ? Ouvrez un ticket sur <a href="${GITHUB_URL}/issues" target="_blank" rel="noopener" class="text-accent hover:underline">le dépôt GitHub de Wavio</a> et un mainteneur vous répondra.</p>`,
        },
      ],
    },
  },
} as const
