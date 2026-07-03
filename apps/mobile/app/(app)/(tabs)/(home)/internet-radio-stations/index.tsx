import { getLocales } from "expo-localization";
import Plus from "lucide-react-native/dist/esm/icons/plus.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import { type ReactElement, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import HomeTabsNav from "@/components/home/HomeTabsNav";
import FavoriteRadioStationListItem from "@/components/internetRadioStations/FavoriteRadioStationListItem";
import {
	radioBrowserToItem,
	serverToItem,
} from "@/components/internetRadioStations/InternetRadioStationListItem";
import RadioStationRow from "@/components/internetRadioStations/RadioStationRow";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useGetInternetRadioStations } from "@/hooks/backend/useInternetRadioStations";
import {
	usePopularStations,
	useStationsByCountryCode,
	useStationsByTag,
	useTopVotedStations,
} from "@/hooks/radioBrowser/useRadioBrowser";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
	useScopedRadioFavorites,
	useSyncServerRadioFavorites,
} from "@/hooks/useRadioFavorites";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import useApp from "@/stores/app";

export default function InternetRadioStationsScreen() {
	const { t } = useTranslation();
	const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
	const screenBottomPadding = useScreenBottomPadding();
	const capabilities = useCapabilities();
	const radioBrowserEnabled = useApp((store) => store.radioBrowserEnabled);
	const configuredCountry = useApp((store) => store.internetRadioCountryCode);
	const feedTags = useApp((store) => store.internetRadioFeedTags);
	const localeCountry = useMemo(
		() => getLocales()[0]?.regionCode ?? undefined,
		[],
	);
	const countryCode = configuredCountry ?? localeCountry;

	useSyncServerRadioFavorites();

	const favoriteItems = useScopedRadioFavorites();

	const {
		data: serverData,
		isLoading: isLoadingServer,
		error: serverError,
	} = useGetInternetRadioStations({ enabled: capabilities.internetRadio });
	const serverStations = useMemo(
		() =>
			(serverData?.internetRadioStations?.internetRadioStation ?? []).map(
				serverToItem,
			),
		[serverData],
	);

	const {
		data: topVoted,
		isLoading: isLoadingTopVoted,
		error: topVotedError,
	} = useTopVotedStations();
	const {
		data: popular,
		isLoading: isLoadingPopular,
		error: popularError,
	} = usePopularStations();
	const {
		data: byCountry,
		isLoading: isLoadingByCountry,
		error: byCountryError,
	} = useStationsByCountryCode({ countryCode });

	return (
		<Box className="flex-1 h-full">
			<HomeTabsNav active="internetRadioStations" />
			<ScrollView
				contentContainerStyle={{
					paddingBottom: screenBottomPadding,
				}}
				showsVerticalScrollIndicator={false}
			>
				{(radioBrowserEnabled || capabilities.internetRadio) && (
					<HStack className="mx-6 mb-4 gap-x-4 items-center">
						{radioBrowserEnabled && (
							<FadeOutScaleDown
								href={"/(app)/(tabs)/(home)/internet-radio-stations/search"}
								className="flex-1"
							>
								<HStack className="px-4 gap-x-4 h-10 rounded-lg bg-primary-600 items-center">
									<Search
										size={20}
										color={"rgb(128, 128, 128)"}
										className="text-primary-100"
									/>
									<Text className="text-primary-100 text-sm">
										{t("app.internetRadioStations.searchPlaceholder")}
									</Text>
								</HStack>
							</FadeOutScaleDown>
						)}
						{capabilities.internetRadio && (
							<FadeOutScaleDown
								href={"/internet-radio-stations/new"}
								className={radioBrowserEnabled ? undefined : "ml-auto"}
							>
								<Plus color={white} />
							</FadeOutScaleDown>
						)}
					</HStack>
				)}

				{favoriteItems.length > 0 && (
					<VStack className="gap-y-4 px-6 mt-4">
						{favoriteItems
							.slice(0, 8)
							.reduce((rows: ReactElement[], favorite, index) => {
								if (index % 4 === 0) {
									rows.push(
										<HStack
											key={`row-${Math.floor(index / 4)}`}
											className="gap-x-4"
										>
											<FavoriteRadioStationListItem
												key={favorite.id}
												station={favorite}
											/>
											{favoriteItems[index + 1] && (
												<FavoriteRadioStationListItem
													key={favoriteItems[index + 1].id}
													station={favoriteItems[index + 1]}
												/>
											)}
											{favoriteItems[index + 2] && (
												<FavoriteRadioStationListItem
													key={favoriteItems[index + 2].id}
													station={favoriteItems[index + 2]}
												/>
											)}
											{favoriteItems[index + 3] && (
												<FavoriteRadioStationListItem
													key={favoriteItems[index + 3].id}
													station={favoriteItems[index + 3]}
												/>
											)}
										</HStack>,
									);
								}
								return rows;
							}, [])}
					</VStack>
				)}

				{capabilities.internetRadio && serverStations.length > 0 && (
					<RadioStationRow
						title={t("app.internetRadioStations.yourStations")}
						isLoading={isLoadingServer}
						error={serverError}
						stations={serverStations}
						skeletonKey="your-stations"
					/>
				)}
				{radioBrowserEnabled && (
					<>
						<RadioStationRow
							title={t("app.internetRadioStations.topVoted")}
							isLoading={isLoadingTopVoted}
							error={topVotedError}
							stations={topVoted?.map(radioBrowserToItem)}
							skeletonKey="top-voted"
						/>
						<RadioStationRow
							title={t("app.internetRadioStations.popular")}
							isLoading={isLoadingPopular}
							error={popularError}
							stations={popular?.map(radioBrowserToItem)}
							skeletonKey="popular"
						/>
						{countryCode && (
							<RadioStationRow
								title={t("app.internetRadioStations.byCountry")}
								isLoading={isLoadingByCountry}
								error={byCountryError}
								stations={byCountry?.map(radioBrowserToItem)}
								skeletonKey="by-country"
							/>
						)}
						{feedTags.map((tag) => (
							<TagRow key={tag} tag={tag} />
						))}
					</>
				)}
			</ScrollView>
		</Box>
	);
}

function TagRow({ tag }: { tag: string }) {
	const { t } = useTranslation();
	const { data, isLoading, error } = useStationsByTag({ tag });
	const titleizedTag = tag
		.split(" ")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
	return (
		<RadioStationRow
			title={t("app.internetRadioStations.byTag", { tag: titleizedTag })}
			isLoading={isLoading}
			error={error}
			stations={data?.map(radioBrowserToItem)}
			skeletonKey={`tag-${tag}`}
		/>
	);
}
