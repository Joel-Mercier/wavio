export default {
  translation: {
    app: {
      home: {
        tabTitle: "Accueil",
        title: "Bonjour {{username}}",
        recentlyPlayed: "Joués récemment",
        recentlyAdded: "Ajoutés récemment",
        mostPlayed: "Les plus joués",
        topRated: "Les mieux notés",
        internetRadioStations: "Stations de radio en ligne",
      },
      search: {
        title: "Recherche",
        inputPlaceholder: "Que voulez-vous écouter ?",
        exploreGenres: "Explorer les genres",
        recentSearches: "Recherches récentes",
        clearRecentSearches: "Effacer",
      },
      library: {
        title: "Bibliothèque",
        searchPlaceholder: "Rechercher dans votre bibliothèque",
        recentSort: "Récent",
        alphabeticalSort: "Alphabétique",
      },
      create: {
        title: "Créer",
        playlistTitle: "Playlist",
        playlistDescription: "Créer une playlist avec des titres",
        internetRadioStationTitle: "Station de radio en ligne",
        internetRadioStationDescription:
          "Créer une station de radio en ligne que vous pouvez diffuser depuis l'application",
      },
      albums: {
        addToPlaylist: "Ajouter à la playlist",
        addToQueue: "Ajouter à la file d'attente",
        goToArtist: "Aller à l'artiste",
        rate: "Noter",
        share: "Partager",
        musicBrainz: "Ouvrir dans MusicBrainz",
        lastFM: "Ouvrir dans Last.fm",
        moreFromArtist: "Plus de {{artist}}",
        favoriteSuccessMessage: "Album ajouté avec succès aux favoris",
        favoriteErrorMessage:
          "Une erreur s'est produite lors de l'ajout de l'album aux favoris",
        unfavoriteSuccessMessage: "Album supprimé avec succès des favoris",
        unfavoriteErrorMessage:
          "Une erreur s'est produite lors de la suppression de l'album des favoris",
        shareSuccessMessage: "Album partagé avec succès",
        shareErrorMessage:
          "Une erreur s'est produite lors de la partage de l'album",
        rateModalTitle: "Noter l'album",
      },
      artists: {
        topSongs: "Chansons les plus écoutées",
        discography: "Discographie",
        about: "À propos",
        rate: "Noter",
        musicBrainz: "Ouvrir dans MusicBrainz",
        lastFM: "Ouvrir dans Last.fm",
        rateModalTitle: "Noter l'artiste",
        albumCount_one: "{{count}} album",
        albumCount_other: "{{count}} albums",
        favoriteSuccessMessage: "Artiste ajouté avec succès aux favoris",
        favoriteErrorMessage:
          "Une erreur s'est produite lors de l'ajout de l'artiste aux favoris",
        unfavoriteSuccessMessage: "Artiste supprimé avec succès des favoris",
        unfavoriteErrorMessage:
          "Une erreur s'est produite lors de la suppression de l'artiste des favoris",
      },
      favorites: {
        title: "Favoris",
        favorite_tracks: "Titres favoris",
      },
      playlists: {
        edit: "Modifier cette playlist",
        delete: "Supprimer cette playlist",
        share: "Partager",
        deletePlaylistConfirmTitle:
          "Êtes-vous sûr de vouloir supprimer cette playlist ?",
        deletePlaylistConfirmDescription:
          "Supprimer cette playlist la supprimera définitivement et ne peut pas être annulé. Êtes-vous sûr de vouloir continuer ?",
        deletePlaylistSuccessMessage: "Playlist supprimée avec succès",
        deletePlaylistErrorMessage:
          "Une erreur s'est produite lors de la suppression de la playlist",
        sharePlaylistSuccessMessage: "Playlist partagée avec succès",
        sharePlaylistErrorMessage:
          "Une erreur s'est produite lors du partage de la playlist",
        removeTrackSuccessMessage: "Titre supprimé avec succès de la playlist",
        removeTrackErrorMessage:
          "Une erreur s'est produite lors de la suppression du titre de la playlist",
        empty: "Cette playlist est vide",
        emptyAction: "Rechercher des titres à ajouter à cette playlist",
      },
      newPlaylist: {
        title: "Donnez un nom à votre playlist",
        newPlaylistSuccessMessage: "Playlist créée avec succès",
        newPlaylistErrorMessage:
          "Une erreur s'est produite lors de la création de la playlist",
        namePlaceholder: "Ma super playlist",
      },
      editPlaylist: {
        title: "Modifier la playlist",
        namePlaceholder: "Entrer le nom de la playlist",
        descriptionPlaceholder: "Entrer la description de la playlist",
      },
      settings: {
        title: "Paramètres",
        musicLibrarySettings: {
          title: "Paramètres de la bibliothèque musicale",
          scanMusicLibraryLabel: "Scanner la bibliothèque musicale",
          scanMusicLibraryDescription:
            "Initie un nouveau scan de la bibliothèque musicale sur votre serveur",
          scanMusicLibraryAction: "Scanner",
          scanMusicLibrarySuccessDescription: "Scan commencé avec succès",
          scanMusicLibraryErrorDescription:
            "Une erreur s'est produite lors du démarrage d'un scan",
          scanStatusLabel: "Statut du scan",
          scanStatusDescription:
            "Indique le statut du scan de votre bibliothèque musicale",
          scanStatusLastScan: "Dernier scan: il y a {{lastScan}}",
          scanStatuses: {
            idle: "Inactif",
            scanning: "Scan en cours",
          },
        },
        displaySettings: {
          title: "Paramètres d'affichage",
          languageLabel: "Langue",
          languageDescription:
            "Définir votre langue par défaut pour l'application Wavio",
          createTabLabel: "Onglet 'créer'",
          createTabDescription:
            "Afficher l'onglet 'créer' dans la barre d'onglets en bas",
        },
        contentSettings: {
          title: "Paramètres de contenu",
          recentSearchesLabel: "Recherches récentes",
          recentSearchesDescription: "Supprimer vos recherches récentes",
          recentSearchesConfirmTitle:
            "Êtes-vous sûr de vouloir supprimer vos recherches récentes stockées ?",
          recentSearchesConfirmDescription:
            "Supprimer ces recherches est irréversible. Êtes-vous sûr de vouloir continuer ?",
          recentPlaysLabel: "Joués récemment",
          recentPlaysDescription:
            "Supprimer vos raccourcis de lecture récents sur l'écran d'accueil",
          recentPlaysConfirmTitle:
            "Êtes-vous sûr de vouloir supprimer vos raccourcis de lecture récents stockés ?",
          recentPlaysConfirmDescription:
            "Supprimer ces raccourcis est irréversible. Êtes-vous sûr de vouloir continuer ?",
        },
      },
      internetRadioStations: {
        newTitle: "Donnez un nom à votre station de radio en ligne",
        namePlaceholder: "Nom de la station",
        streamUrlPlaceholder: "URL du flux",
        homePageUrlPlaceholder: "URL de la page d'accueil",
        edit: "Modifier la station de radio en ligne",
        delete: "Supprimer la station de radio en ligne",
        newSuccessMessage: "Station de radio en ligne créée avec succès",
        newErrorMessage:
          "Une erreur s'est produite lors de la création de la station de radio en ligne",
        visitHomePage: "Visiter la page d'accueil",
        editInternetRadioStation: "Modifier la station de radio en ligne",
        deleteInternetRadioStation: "Supprimer la station de radio en ligne",
        deleteInternetRadioStationSuccessMessage:
          "Station de radio en ligne supprimée avec succès",
        deleteInternetRadioStationErrorMessage:
          "Une erreur s'est produite lors de la suppression de la station de radio en ligne.",
        deleteInternetRadioStationConfirmTitle:
          "Êtes-vous sûr de vouloir supprimer cette station de radio en ligne?",
        deleteInternetRadioStationConfirmDescription:
          "Supprimer la station de radio en ligne la supprimera définitivement. Êtes-vous sûr de vouloir continuer ?",
        editInternetRadioStationModalTitle:
          "Modifier la station de radio en ligne",
        editInternetRadioStationSuccessMessage:
          "Station de radio en ligne mise à jour avec succès.",
        editInternetRadioStationErrorMessage:
          "Une erreur s'est produite lors de la mise à jour de la station de radio en ligne.",
      },
      tracks: {
        addToFavorites: "Ajouter aux favoris",
        addToPlaylist: "Ajouter à la playlist",
        addToAnotherPlaylist: "Ajouter à une autre playlist",
        removeFromPlaylist: "Retirer de la playlist",
        addToQueue: "Ajouter à la file d'attente",
        goToArtist: "Aller à l'artiste",
        rate: "Noter",
        share: "Partager",
        getInfo: "Obtenir des informations",
        download: "Télécharger",
        musicBrainz: "Ouvrir dans MusicBrainz",
        trackInfoModalTitle: "Informations sur le titre",
        rateModalTitle: "Noter le titre",
        favoriteSuccessMessage: "Titre ajouté avec succès aux favoris",
        favoriteErrorMessage:
          "Une erreur s'est produite lors de l'ajout du titre aux favoris",
        unfavoriteSuccessMessage: "Titre supprimé avec succès des favoris",
        unfavoriteErrorMessage:
          "Une erreur s'est produite lors de la suppression du titre des favoris",
        shareSuccessMessage: "Titre partagé avec succès",
        shareErrorMessage: "Une erreur s'est produite lors du partage du titre",
        downloadSuccessMessage: "Titre téléchargé avec succès",
        downloadErrorMessage:
          "Une erreur s'est produite lors du téléchargement du titre",
        rateSuccessMessage: "Notation du titre réussie",
        rateErrorMessage:
          "Une erreur s'est produite lors de la notation du titre",
        infoModal: {
          title: "Titre",
          path: "Chemin",
          artist: "Artiste de l'album",
          artists: "Artistes",
          album: "Album",
          discNumber: "Numéro de disque",
          track: "Numéro de piste",
          year: "Année de sortie",
          genres: "Genres",
          duration: "Durée",
          codec: "Codec",
          bitRate: "Bitrate",
          channelCount: "Canaux",
          size: "Taille",
          favorite: "Favoris",
          playCount: "Nombre de lectures",
          lastPlayed: "Dernière lecture",
          modified: "Date de modification",
          albumPeak: "Point de coupe de l'album",
          trackPeak: "Point de coupe de la piste",
        },
      },
      player: {
        title: "En cours de lecture",
        addToPlaylist: "Ajouter à la playlist",
        addToQueue: "Ajouter à la file d'attente",
        goToArtist: "Aller à l'artiste",
        rate: "Noter",
        share: "Partager",
        download: "Télécharger",
      },
      shares: {
        title: "Partages",
        visitCount_one: "{{count}} visite",
        visitCount_other: "{{count}} visites",
        editShare: "Modifier le partage",
        deleteShare: "Supprimer le partage",
        editShareSuccessMessage: "Partage mis à jour avec succès",
        editShareErrorMessage:
          "Une erreur s'est produite lors de la mise à jour du partage",
        deleteShareSuccessMessage: "Partage supprimé avec succès",
        deleteShareErrorMessage:
          "Une erreur s'est produite lors de la suppression du partage",
        noDescription: "Aucune description",
        deleteShareConfirmTitle:
          "Êtes-vous sûr de vouloir supprimer ce partage ?",
        deleteShareConfirmDescription:
          "Supprimer le partage le supprimera définitivement et empêchera d'autres d'accéder aux titre partagés. Êtes-vous sûr de vouloir continuer ?",
        editShareModalTitle: "Modifier le partage",
      },
      servers: {
        title: "Serveurs",
        addServer: "Ajouter un serveur",
        namePlaceholder: "Entrer le nom du serveur",
        urlPlaceholder: "Entrer l'URL du serveur",
        usernamePlaceholder: "Entrer le nom d'utilisateur du serveur",
        passwordPlaceholder: "Entrer le mot de passe du serveur",
        editServer: "Modifier le serveur",
        deleteServer: "Supprimer le serveur",
        createServerSuccessMessage: "Serveur ajouté avec succès",
        editServerSuccessMessage: "Serveur mis à jour avec succès",
        deleteServerConfirmTitle:
          "Êtes-vous sûr de vouloir supprimer ce serveur ?",
        deleteServerConfirmDescription:
          "Supprimer le serveur le supprimera définitivement. Êtes-vous sûr de vouloir continuer ?",
      },
      shared: {
        cancel: "Annuler",
        create: "Créer",
        delete: "Supprimer",
        unknown: "Inconnu",
        favorites: "Favoris",
        album_one: "Album",
        album_other: "Albums",
        artist_one: "Artiste",
        artist_other: "Artistes",
        playlist_one: "Playlist",
        playlist_other: "Playlists",
        song_one: "Titre",
        song_other: "Titres",
        save: "Enregistrer",
        seeMore: "Voir plus",
        noData: "Aucune donnée",
        albumCount_one: "{{count}} album",
        albumCount_other: "{{count}} albums",
        songCount_one: "{{count}} titre",
        songCount_other: "{{count}} titres",
        toastSuccessTitle: "Succès",
        toastErrorTitle: "Erreur",
        rateSuccessMessage: "Notation réussie",
        rateErrorMessage: "Une erreur s'est produite lors de la notation",
        shareUrlCopiedMessage: "URL de partage copiée dans le presse-papier",
        shareUrlErrorMessage:
          "Une erreur s'est produite lors de la copie de l'URL de partage dans le presse-papier",
        tabs: {
          home: "Accueil",
          search: "Recherche",
          library: "Bibliothèque",
          create: "Créer",
        },
        sidebar: {
          settings: "Paramètres",
          shares: "Partages",
          servers: "Serveurs",
          logout: "Déconnexion",
          currentServer: "Serveur actuel",
          version: "version {{version}}",
        },
        languages: {
          en: "English",
          fr: "Français",
        },
      },
      auth: {
        login: {
          title: "Connexion",
          serverPlaceholder: "Sélectionner un serveur",
          urlPlaceholder: "Entrer l'URL du serveur",
          usernamePlaceholder: "Entrer le nom d'utilisateur",
          passwordPlaceholder: "Entrer le mot de passe de l'utilisateur",
          choice: "Ou entrer vos détails de serveur",
          login: "Connexion",
          loginSuccessMessage: "Connexion réussie",
        },
      },
    },
  },
};
