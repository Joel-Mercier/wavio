import { GITHUB_URL } from '../consts'

export const languages = {
  en: 'English',
  ru: 'Русский',
  fr: 'Français',
  cn: '简体中文'
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

  ru: {
    meta: {
      homeTitle: 'Wavio. Твоя музыка, твой плеер, твои правила.',
      homeDescription:
        'Android-плеер с открытым исходным кодом для Navidrome, Jellyfin, OpenSubsonic или твоей локальной библиотеки. Без рекламы, без слежки, работает полностью офлайн.',
      privacyTitle: 'Политика конфиденциальности Wavio',
      privacyDescription:
        "Wavio работает только на твоем устройстве и общается только с тем сервером, который ты настроишь. Мы не собираем, не продаем и не передаем твои данные.",
    },
    nav: {
      features: 'Возможности',
      github: 'GitHub',
      download: 'Скачать',
    },
    hero: {
      tag: 'Музыкальный плеер с открытым кодом',
      titleLines: [
        ['Твоя', 'музыка,'],
        ['твой', 'плеер,'],
      ],
      titleAccent: 'твои правила.',
      lead: 'Android-плеер для серверов Navidrome, Jellyfin, OpenSubsonic или локальной медиатеки. Создан для тех, кто владеет своей музыкой и хочет, чтобы плеер ощущался как родной.',
    },
    cta: {
      releaseMain: 'Скачать последний релиз',
      releaseNote: 'Скоро в Google Play',
      starGithub: 'Смотреть на GitHub',
      viewSource: 'Исходный код',
    },
    highlightsLabel: 'Что ты получаешь',
    highlights: [
      'Open source, лицензия MIT',
      'Никакой рекламы, никогда',
      'Никакой слежки и телеметрии',
      'Полностью работает офлайн',
      'Готов к Android Auto',
      'Navidrome, Jellyfin, OpenSubsonic и локальная библиотека',
    ],
    features: {
      headingPre: 'Плеер, который',
      headingEm: 'уважает',
      headingPost: 'твою медиатеку.',
      sub: 'Каждый экран заточен под твой стиль прослушивания. Работает быстро, без лишнего шума и полностью на твоих условиях',
      home: {
        label: 'Главная',
        title: 'Твоя медиатека с прекрасной сортировкой.',
        desc: '«Недавние», «Новые», «Популярные» и «Интернет-радио» - всё на одном чистом главном экране.',
      },
      audiophile: {
        label: 'Аудиофилам',
        title: 'Широта настроек.',
        desc: 'Проигрывание без пауз, с кроссфейдом, с эквалайзром и нормализацией звука.',
      },
      offline: { label: 'Офлайн-прослушивание', title: 'Уходи в офлайн.' },
      quote: {
        label: 'Никаких подвохов',
        title: 'Без рекламы. Без аккаунтов. Без слежки. Таким, каким музыкальное приложение должно быть.',
      },
      playlists: { label: 'Плейлисты', title: 'Умные правила, полный контроль.' },
      auto: { label: 'В машине', title: 'Android Auto на борту.' },
      queue: {
        label: 'Очередь',
        title: 'Очередь, которой ты реально управляешь.',
        desc: 'Меняй местами, редактируй, очищай. Сохраняй текущую очередь как плейлист в одно касание.',
      },
      servers: {
        label: 'Сервера',
        title: 'Переключайся между серверами в одно касание.',
        desc: "Navidrome дома, Jellyfin у друга, OpenSubsonic где-то еще и локальная библиотека для подстраховки. Одно приложение для всего.",
      },
      sleep: {
        label: 'Таймер сна',
        title: 'Засыпай под музыку.',
        desc: 'Музыка плавно стихнет сама — просто настрой таймер.',
      },
      podcasts: {
        label: 'Подкасты',
        title: 'Узнавай новое где бы ты не был.',
        desc: 'Поиск, подписки и воспроизведение подкастов через Taddy. Твои треки и твои шоу в одном месте.',
      },
      radio: {
        label: 'Интернет-радио',
        title: 'Настраивайся на волну.',
        desc: 'Слушай интернет-радио прямо со своего сервера. Ищи, сохраняй и слушай в прямом эфире.',
      },
      lyrics: {
        label: 'Тексты песен',
        title: 'Подпевай исполнителю.',
        desc: 'Синхронизированные тексты из LRCLib, которые листаются строчка за строчкой вместе с музыкой.',
      },
      widgets: {
        label: 'Виджеты',
        title: 'Все под рукой.',
        desc: 'То, что играет сейчас, и недавние треки — прямо на рабочем столе Android. Даже открывать приложение не нужно.',
      },
    },
    showcase: {
      headingPre: 'Каждый экран',
      headingEm: 'на своем месте.',
      sub: 'Интерфейс заточен под то, что ты делаешь чаще всего. Ищи, слушай, ставь в очередь, настраивай, скачивай — приложение просто делает свою работу, не отвлекая тебя от музыки.',
    },
    final: {
      titleL1: 'Верни свою музыку',
      titleEm: 'домой.',
      desc: 'Бесплатно, с открытым кодом и сделано людьми, которые считают, что твоя медиатека должна принадлежать тебе.',
    },
    footer: {
      tagline:
        'Музыкальный Android-плеер с открытым кодом. Совместим с Navidrome, Jellyfin, OpenSubsonic и локальными библиотеками.',
      product: 'Продукт',
      features: 'Возможности',
      download: 'Скачать',
      changelog: 'История изменений',
      openSource: 'Open Source',
      github: 'GitHub',
      legal: 'Юридическая информация',
      privacy: 'Конфиденциальность',
      copyright: '© 2026 Joel Mercier',
      madeWith: 'Сделано на Astro и TailwindCSS. Хостинг на Vercel. Весь текст набран шрифтом Inter.',
    },
    privacy: {
      back: 'Назад',
      titlePre: 'Конфиденциальность:',
      titleEm: 'скучная, но важная.',
      updated: 'Последнее обновление: 27 мая 2026',
      readTime: '5 минут на чтение',
      summaryLabel: 'В одном предложении',
      summary:
        "Wavio работает только на твоем устройстве и общается только с тем сервером, который ты настроишь. Мы не собираем, не продаем и не передаем твои данные, потому что их у нас просто нет.",
      sections: [
        {
          num: '01',
          title: 'Кто мы',
          body: `<p>Wavio — это бесплатное приложение для Android с открытым кодом, которое поддерживают независимые контрибьюторы. Исходный код опубликован под лицензией MIT и доступен для изучения на <a href="${GITHUB_URL}" target="_blank" rel="noopener" class="text-accent hover:underline">GitHub</a>.</p>`,
        },
        {
          num: '02',
          title: 'Что Wavio собирает о тебе',
          body: `<p><strong>Ничего персонального.</strong> В Wavio нет аккаунтов, профилей, рекламных SDK, поведенческой аналитики или социальных трекеров. Мы не управляем никаким сервером, который хранит информацию о том, кто ты и что ты слушаешь.</p>
            <p>Единственные данные, которые покидают телефон, — это то, что нужно для воспроизведения музыки или для того, чтобы мы могли диагностировать ошибки (об этом в следующих разделах).</p>`,
        },
        {
          num: '03',
          title: 'Что остается на твоем устройстве',
          body: `<p>Чтобы быть музыкальным плеером, Wavio локально хранит на твоем телефоне только следующее:</p>
          <ul>
            <li>Данные подключения к серверам (URL, имя пользователя и зашифрованный пароль или токен).</li>
            <li>Твою очередь воспроизведения, историю прослушиваний и поиска, настройки таймера сна и эквалайзера, и прочие настройки приложения.</li>
            <li>Треки, которые ты скачал для офлайн-прослушивания, а также кэш обложек и метаданные, полученные с сервера.</li>
              <li>API-ключи для подкастов (Taddy), если ты их включишь.</li>
          </ul>
          <p>Эта информация хранится в закрытом хранилище приложения. При удалении Wavio всё это удаляется.</p>`,
        },
        {
          num: '04',
          title: 'Что видит твой музыкальный сервер',
          body: `<p>Когда ты подключаешь Wavio к Navidrome, Jellyfin или OpenSubsonic, приложение общается напрямую с сервером, используя твои данные. Сервер обычно логирует твой IP-адрес, запросы и активность прослушивания, как и любой другой клиент.</p>
            <p>Контрибьюторы Wavio не управляют этими серверами и не имеют доступа к их логам.</p>
          <p>Пожалуйста, ознакомься с политикой конфиденциальности того сервера, к которому подключаешься.</p>`,
        },
        {
          num: '05',
          title: 'Отчеты об ошибках и крашах',
          body: `<p>Рабочие сборки Wavio используют <a href="https://sentry.io/" target="_blank" rel="noopener" class="text-accent hover:underline">Sentry</a>, чтобы сообщать о вылетах и непредвиденных ошибках, чтобы мы могли их исправить. Каждый отчет включает технический контекст: стек вызовов, версию приложения, модель устройства, версию Android и IP-адрес отправителя.</p>
            <p>Мы не присваиваем тебе идентификатор, не отслеживаем, какие разделы ты посещаешь, не логируем, что ты слушаешь, и не строим твой цифровой профиль. Отчеты нужны только для поиска багов и хранятся согласно <a href="https://sentry.io/privacy/" target="_blank" rel="noopener" class="text-accent hover:underline">политике хранения данных Sentry</a>.</p>`,
        },
        {
          num: '06',
          title: 'Разрешения Android',
          body: `<p>Wavio запрашивает только те разрешения, которые нужны для музыки:</p>
          <ul>
            <li><strong>Интернет</strong> для доступа к серверу и сторонним сервисам.</li>
            <li><strong>Фоновый сервис и воспроизведение медиа</strong> чтобы музыка играла, когда экран выключен.</li>
            <li><strong>Уведомления</strong> чтобы показывать управление плеером на экране блокировки и в шторке.</li>
              <li><strong>Изменение настроек аудио</strong> чтобы применять системный эквалайзер.</li>
            <li><strong>Чтение медиа и хранилища</strong> чтобы скачивать и читать сохраненные треки для офлайн-воспроизведения.</li>
              <li><strong>Вибрация</strong> для легкой отдачи при нажатии на некоторые кнопки.</li>
            </ul>
            <p>Wavio не просит доступ к контактам, геопозиции, камере или другим личным данным.</p>`,
        },
        {
          num: '07',
          title: 'Сторонние сервисы',
          body: `<p>Помимо твоего музыкального сервера и Sentry, Wavio общается с парой сторонних сервисов, но только если ты пользуешься соответствующей функцией:</p>
            <ul>
              <li><strong><a href="https://lrclib.net/" target="_blank" rel="noopener" class="text-accent hover:underline">LRCLib</a></strong> — запрашивает синхронизированные тексты, когда ты открываешь экран с текстом песни.</li>
              <li><strong><a href="https://taddy.org/" target="_blank" rel="noopener" class="text-accent hover:underline">Taddy</a></strong> — обеспечивает поиск и метаданные подкастов, используется только если ты сам вставишь свои API-ключ и ID пользователя в настройках.</li>
              <li><strong><a href="https://www.radio-browser.info/" target="_blank" rel="noopener" class="text-accent hover:underline">Radio Browser</a></strong> — предоставляет каталог интернет-радио, используется, когда ты ищешь станции.</li>
              <li><strong>Google Cast</strong> — используется для трансляции на Chromecast-устройства. В этом случае применяются правила Google для этой сессии.</li>
            </ul>
            <p>В Wavio нет никаких рекламных сетей, аналитики или социальных трекеров.</p>`,
        },
        {
          num: '08',
          title: 'Дети',
          body: `<p>Wavio подходит для пользователей всех возрастов и сознательно не собирает никакую информацию ни о ком, включая детей.</p>`,
        },
        {
          num: '09',
          title: 'Изменения в политике конфиденциальности',
          body: `<p>Если эта политика конфиденциальности изменится, обновленная версия будет опубликована здесь и анонсирована в release notes проекта на GitHub.</p>`,
        },
        {
          num: '10',
          title: 'Контакты',
          body: `<p>Есть вопросы, замечания или просто любопытство? Открывай issue в <a href="${GITHUB_URL}/issues" target="_blank" rel="noopener" class="text-accent hover:underline">репозитории Wavio на GitHub</a>, и кто-нибудь из разработчиков ответит тебе.</p>`,
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
      'Navidrome, Jellyfin, OpenSubsonic ou une bibliothèque locale',
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

  cn: {
    meta: {
      homeTitle: 'Wavio. 音乐由你，播放由你，风格由你。',
      homeDescription:
        '一款开源 Android 音乐播放器，为 Navidrome、Jellyfin 和 OpenSubsonic 服务器或本地音乐库而生。无广告，无追踪，支持完全离线使用。',
      privacyTitle: 'Wavio 隐私政策',
      privacyDescription:
        "Wavio 只在您的设备上运行，仅与您配置的音乐服务器通信。我们不会收集、出售或分享您的任何数据。",
    },
    nav: {
      features: '功能',
      github: 'GitHub',
      download: '下载',
    },
    hero: {
      tag: '一款开源音乐播放器',
      titleLines: [
        ['音乐', '由你，'],
        ['播放', '由你，'],
      ],
      titleAccent: '风格由你。',
      lead: '一款 Android 音乐播放器，支持 Navidrome、Jellyfin、OpenSubsonic 及本地音乐库。打造仅属于你的音乐库与归属感。',
    },
    cta: {
      releaseMain: '获取最新版本',
      releaseNote: '即将上架 Google Play',
      starGithub: '在 GitHub 上查看',
      viewSource: '查看源代码',
    },
    highlightsLabel: '亮点速览',
    highlights: [
      '开源，MIT 许可',
      '永无广告',
      '无追踪，不收集运行数据',
      '可完全离线使用',
      '支持 Android Auto',
      '支持 Navidrome、Jellyfin、OpenSubsonic 及本地音乐库',
    ],
    features: {
      headingPre: '只播放',
      headingEm: '不越界',
      headingPost: '的音乐播放器。',
      sub: '每个界面，都为你的听歌习惯而生。快速、安静，由你掌控。',
      home: {
        label: '首页',
        title: '你的曲库，井井有条。',
        desc: '	最近播放、最近添加、最多播放和网络电台，首屏尽览。',
      },
      audiophile: {
        label: '高保真',
        title: '调声，而非调响。',
        desc: '无缝播放、平滑过渡、回放增益、均衡器。',
      },
      offline: { label: '离线模式', title: '离线，不受限。' },
      quote: {
        label: '纯净',
        title: '无广告。无账户。无追踪。回归音乐应用本该有的样子。',
      },
      playlists: { label: '歌单', title: '智能歌单，随你定制。' },
      auto: { label: '车载', title: 'Android Auto，原生支持。' },
      queue: {
        label: '播放队列',
        title: '播放队列，真正可控。',
        desc: '排序、编辑、清空。一键保存当前队列为歌单。',
      },
      servers: {
        label: '服务器',
        title: '多个后端，一键切换。',
        desc: "家里用 Navidrome，朋友那用 Jellyfin，别处还有 OpenSubsonic，再加上本地音乐库作备份。一个应用接管所有。",
      },
      sleep: {
        label: '睡眠定时',
        title: '渐弱入眠。',
        desc: '逐渐静默，让喜欢的专辑伴你缓缓入眠。',
      },
      podcasts: {
        label: '播客',
        title: '边走边听，总有收获。',
        desc: '搜索、订阅和播放由 Taddy 提供的播客。音乐与播客，一应俱全。',
      },
      radio: {
        label: '网络电台',
        title: '想听就听，哪都行。',
        desc: '一键播放在你的服务器上收藏的网络电台。浏览、保存、实时收听。',
      },
      lyrics: {
        label: '歌词',
        title: '同步跟唱。',
        desc: '来自 LRCLib 的同步歌词，逐行滚动，随曲同步。',
      },
      widgets: {
        label: '桌面小组件',
        title: '一目了然。',
        desc: '正在播放和最近播放，直接显示在 Android 桌面上。无需打开应用。',
      },
    },
    showcase: {
      headingPre: '每个界面，',
      headingEm: '恰到好处。',
      sub: '界面随你的使用习惯调整。浏览、播放、队列、调音、下载，无感体验。',
    },
    final: {
      titleL1: '把音乐，',
      titleEm: '带回家。',
      desc: '免费、开源，由一群坚信音乐库就该属于你的人打造。',
    },
    footer: {
      tagline:
        '一款开源 Android 音乐播放器，兼容 Navidrome、Jellyfin、OpenSubsonic 及本地音乐库。',
      product: '产品',
      features: '功能',
      download: '下载',
      changelog: '更新日志',
      openSource: '开源',
      github: 'GitHub',
      legal: '法律',
      privacy: '隐私政策',
      copyright: '© 2026 Joel Mercier',
      madeWith: '基于 Astro 和 TailwindCSS 构建，部署于 Vercel。所有文字使用 Inter 字体。',
    },
    privacy: {
      back: '返回首页',
      titlePre: '隐私政策，',
      titleEm: '平平无奇的那种。',
      updated: '最后更新于 2026年5月27日',
      readTime: '阅读约需 5分钟',
      summaryLabel: '省流总结',
      summary:
        "Wavio 完全运行于你的设备本地，仅与你配置的音乐服务器通信。我们不会收集、出售或分享你的数据——因为我们根本没有这些数据。",
      sections: [
        {
          num: '01',
          title: '关于我们',
          body: `<p>Wavio 是一款免费、开源的 Android 应用，由独立贡献者维护。源代码根据 MIT 许可证发布，任何人都可以在 <a href="${GITHUB_URL}" target="_blank" rel="noopener" class="text-accent hover:underline">GitHub</a> 上查看。</p>`,
        },
        {
          num: '02',
          title: 'Wavio 向你收集哪些信息',
          body: `<p><strong>不涉及任何个人信息。</strong> Wavio 没有账户系统、没有用户档案、没有广告 SDK、没有行为分析工具、也没有社交追踪器。我们不运营任何存储用户身份或收听记录的服务器。</p>
						<p>从你的设备中发出的数据，仅有用于播放音乐所需的请求，以及帮助我们定位崩溃问题的诊断信息，具体见下两节。</p>`,
        },
        {
          num: '03',
          title: '哪些数据留在你的设备上',
          body: `<p>作为一款音乐播放器，Wavio 会在你的手机本地存储以下数据：</p>
					<ul>
						<li>你添加的每台服务器的连接信息（URL、用户名以及加密的密码或令牌）。</li>
						<li>你的播放队列、最近播放和最近搜索的项目、睡眠定时和均衡器设置，以及其他应用偏好。</li>
						<li>你选择下载以供离线收听的曲目，以及从服务器获取的缓存的封面和元数据。</li>
							<li>如果你启用播客，则存储播客 API 凭证（Taddy）。.</li>
					</ul>
					<p>这些信息存储在应用的私有存储空间中。卸载 Wavio 将删除所有数据。</p>`,
        },
        {
          num: '04',
          title: '你的音乐服务器会记录什么',
          body: `<p>当你将 Wavio 连接到 Navidrome、Jellyfin 或 OpenSubsonic 服务时，应用会使用你提供的凭证直接与该服务器通信。与任何其他客户端一样，服务器通常会记录你的 IP 地址、发出的请求以及收听活动。</p>
						<p>Wavio 的贡献者不运营那些服务器，也无法访问它们的日志记录。</p>
					<p>具体请查阅你所连接的服务器对应的隐私政策。</p>`,
        },
        {
          num: '05',
          title: '崩溃与错误报告',
          body: `<p>Wavio 的正式版本使用 <a href="https://sentry.io/" target="_blank" rel="noopener" class="text-accent hover:underline">Sentry</a> 来报告崩溃和意外错误，以便我们修复它们。每份报告都包含技术上下文，如堆栈跟踪、应用版本、设备型号、Android 版本，以及发送报告的 IP 地址。</p>
						<p>我们不会为你分配标识符，不会追踪你访问的页面，不会记录你收听的内容，也不会建立用户画像。报告仅用于诊断错误，并按照 <a href="https://sentry.io/privacy/" target="_blank" rel="noopener" class="text-accent hover:underline">Sentry 的数据保留政策</a> 进行保留。</p>`,
        },
        {
          num: '06',
          title: 'Android 权限',
          body: `<p>Wavio 仅请求播放音乐所需的权限：</p>
					<ul>
						<li><strong>网络</strong> 用于连接你的音乐服务器及下述第三方服务。</li>
						<li><strong>前台服务与媒体播放</strong> 用于在屏幕关闭时保持音频持续播放。</li>
						<li><strong>通知</strong> 于在锁屏界面和通知栏中显示播放控制。</li>
							<li><strong>修改音频设置</strong> 用于应用系统均衡器。</li>
						<li><strong>读取媒体音频与存储</strong> 用于保存和读取已下载的曲目，以便离线播放。</li>
							<li><strong>振动</strong> 用于某些控制按钮的轻微触感反馈。</li>
						</ul>
						<p>Wavio 不会请求访问你的通讯录、精确位置、相机或其他任何敏感数据。</p>`,
        },
        {
          num: '07',
          title: '第三方服务',
          body: `<p>除了你的音乐服务器和 Sentry 之外，Wavio 还会与少量外部服务通信，且仅在相应功能被使用时才会进行：</p>
						<ul>
							<li><strong><a href="https://lrclib.net/" target="_blank" rel="noopener" class="text-accent hover:underline">LRCLib</a></strong> 当你打开某首曲目的歌词视图时，会向其查询同步歌词。</li>
							<li><strong><a href="https://taddy.org/" target="_blank" rel="noopener" class="text-accent hover:underline">Taddy</a></strong> 为播客搜索和元数据提供支持，仅当你在设置中提供了自己的 Taddy API 密钥和用户 ID 时才会被调用。</li>
							<li><strong><a href="https://www.radio-browser.info/" target="_blank" rel="noopener" class="text-accent hover:underline">Radio Browser</a></strong> 提供网络电台目录，当你浏览或搜索电台时会被查询。</li>
							<li><strong>Google Cast</strong> 当你将播放内容投射到兼容 Chromecast 的设备时使用。该会话将适用 Google 的相关条款。</li>
						</ul>
						<p>Wavio 未集成任何广告网络、数据分析提供商或社交追踪器。</p>`,
        },
        {
          num: '08',
          title: '儿童',
          body: `<p>Wavio 适用于所有年龄段的用户，且不会有意收集包括儿童在内的任何人的信息。</p>`,
        },
        {
          num: '09',
          title: '本政策的变更',
          body: `<p>如果本政策发生变更，更新后的版本将在此处发布，并在 GitHub 上的项目更新日志中公布。</p>`,
        },
        {
          num: '10',
          title: '联系方式',
          body: `<p>有任何问题、疑虑或好奇？欢迎在 <a href="${GITHUB_URL}/issues" target="_blank" rel="noopener" class="text-accent hover:underline">Wavio GitHub 仓库</a> 中提交 Issue，维护者会及时回复你。</p>`,
        },
      ],
    },
  },
} as const
