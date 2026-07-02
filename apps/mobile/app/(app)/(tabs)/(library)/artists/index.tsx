import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import Fuse from "fuse.js";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AlphabetIndexBar from "@/components/artists/AlphabetIndexBar";
import ArtistListItem from "@/components/artists/ArtistListItem";
import ArtistListItemSkeleton from "@/components/artists/ArtistListItemSkeleton";
import ArtistSectionHeader from "@/components/artists/ArtistSectionHeader";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { useArtists } from "@/hooks/backend/useBrowsing";
import useDebounce from "@/hooks/useDebounce";
import { useFloatingPlayerInset } from "@/hooks/useFloatingPlayerInset";
import type { ArtistID3 } from "@/services/openSubsonic/types";
import { useCurrentMusicFolderId } from "@/stores/musicFolders";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";

type ArtistRow =
	| {
			type: "header";
			id: string;
			letter: string;
			letterIdx: number;
	  }
	| { type: "artist"; id: string; artist: ArtistID3; letterIdx: number };

export default function AllArtistsScreen() {
	const [white, primary50] = Uniwind.getCSSVariable([
		"--color-white",
		"--color-primary-50",
	]) as string[];
	const { t } = useTranslation();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const bottomTabBarHeight = useBottomTabBarHeight();
	const floatingPlayerInset = useFloatingPlayerInset();
	const musicFolderId = useCurrentMusicFolderId();
	const form = useForm({ defaultValues: { query: "" } });
	const query = useStore(form.store, (state) => state.values.query);
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const debounce = useDebounce(150);
	const listRef = useRef<FlashListRef<ArtistRow>>(null);
	const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
	const pinnedSectionRef = useRef(false);

	useEffect(() => {
		debounce(() => setDebouncedQuery(query));
	}, [query, debounce]);

	// Editing the query swaps the result set; without this the list keeps its old
	// offset and hides the new top matches (notably when deleting characters).
	useEffect(() => {
		listRef.current?.scrollToOffset({ offset: 0, animated: false });
	}, [debouncedQuery]);

	const { data, isLoading, error } = useArtists({ musicFolderId });

	const allArtists = useMemo<ArtistID3[]>(
		() => data?.artists?.index?.flatMap((i) => i.artist ?? []) ?? [],
		[data],
	);

	// Browse mode: keep the backend's alphabetical grouping so we can render
	// section headers and drive the index bar.
	const { rows, letters, headerRowIndex } = useMemo(() => {
		const index = data?.artists?.index ?? [];
		const rows: ArtistRow[] = [];
		const letters: string[] = [];
		const headerRowIndex: number[] = [];
		index.forEach((group, letterIdx) => {
			letters.push(group.name);
			headerRowIndex.push(rows.length);
			rows.push({
				type: "header",
				id: `header-${group.name}`,
				letter: group.name,
				letterIdx,
			});
			for (const artist of group.artist ?? []) {
				rows.push({ type: "artist", id: artist.id, artist, letterIdx });
			}
		});
		return { rows, letters, headerRowIndex };
	}, [data]);

	const fuse = useMemo(
		() => new Fuse(allArtists, { ignoreDiacritics: true, keys: ["name"] }),
		[allArtists],
	);

	const searchRows = useMemo<ArtistRow[]>(() => {
		if (!debouncedQuery) return [];
		return fuse.search(debouncedQuery).map((result) => ({
			type: "artist",
			id: result.item.id,
			artist: result.item,
			letterIdx: -1,
		}));
	}, [fuse, debouncedQuery]);

	const listData = useMemo<ArtistRow[]>(
		() => (debouncedQuery ? searchRows : rows),
		[debouncedQuery, searchRows, rows],
	);

	const showIndexBar = !debouncedQuery && !isLoading && letters.length > 1;

	const handleSelectLetter = useCallback(
		(index: number) => {
			const rowIndex = headerRowIndex[index];
			if (rowIndex == null) return;
			// Keep the picked letter highlighted even when the list can't scroll it
			// to the very top (short tail sections): pin it and ignore the scroll
			// callback until the user scrolls the list themselves.
			pinnedSectionRef.current = true;
			setCurrentSectionIdx(index);
			listRef.current
				?.scrollToIndex({ index: rowIndex, animated: false, viewPosition: 0 })
				.catch(() => {});
		},
		[headerRowIndex],
	);

	// Highlight the current section in the index bar while scrolling normally.
	const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 0 }).current;
	const onViewableItemsChanged = useRef(
		({ viewableItems }: { viewableItems: Array<{ item: ArtistRow }> }) => {
			if (pinnedSectionRef.current) return;
			const first = viewableItems[0]?.item;
			if (first && first.letterIdx >= 0) {
				setCurrentSectionIdx(first.letterIdx);
			}
		},
	).current;

	const handleSearchClearPress = () => {
		form.setFieldValue("query", "");
	};

	return (
		<Box className="h-full flex-1">
			<Box
				className="bg-primary-600 px-6 py-6 mb-6"
				style={{ paddingTop: insets.top + 24 }}
			>
				<HStack className="items-center mb-4">
					<FadeOutScaleDown
						className="mr-4"
						onPress={() => goBackOrHome(router)}
					>
						<ArrowLeft size={24} color={white} />
					</FadeOutScaleDown>
					<Heading className="text-white" size="xl">
						{t("app.library.allArtists")}
					</Heading>
				</HStack>
				<form.Field name="query">
					{(field) => (
						<Input className="border-0">
							<InputSlot className="pl-3">
								<InputIcon as={Search} />
							</InputSlot>
							<InputField
								disableFullscreenUI
								className="text-white text-lg"
								placeholder={t("app.library.search.inputPlaceholder")}
								placeholderTextColor={primary50}
								type="text"
								value={field.state.value}
								onChangeText={field.handleChange}
								onBlur={field.handleBlur}
								enterKeyHint="search"
							/>
							{query ? (
								<InputSlot className="pr-3" onPress={handleSearchClearPress}>
									<InputIcon as={X} />
								</InputSlot>
							) : null}
						</Input>
					)}
				</form.Field>
			</Box>
			{error && <ErrorDisplay error={error as Error} />}
			{!error && (
				<Box className="flex-1 relative">
					<FlashList
						ref={listRef}
						// Off by default it keeps the visible item pinned when the filtered
						// set changes above the viewport, which hides the new top matches on
						// query edits and overrides our scroll-to-top.
						maintainVisibleContentPosition={{ disabled: true }}
						data={isLoading ? (loadingData(12) as ArtistRow[]) : listData}
						keyExtractor={(item, index) =>
							isLoading ? `skeleton-${index}` : item.id
						}
						getItemType={(item) => (isLoading ? "artist" : item.type)}
						viewabilityConfig={viewabilityConfig}
						onViewableItemsChanged={onViewableItemsChanged}
						onScrollBeginDrag={() => {
							pinnedSectionRef.current = false;
						}}
						renderItem={({
							item,
							index,
						}: {
							item: ArtistRow;
							index: number;
						}) => {
							if (isLoading) {
								return (
									<ArtistListItemSkeleton index={index} layout="vertical" />
								);
							}
							if (item.type === "header") {
								return <ArtistSectionHeader letter={item.letter} />;
							}
							return (
								<ArtistListItem
									artist={item.artist}
									index={index}
									layout="vertical"
								/>
							);
						}}
						ListEmptyComponent={() => (isLoading ? null : <EmptyDisplay />)}
						showsVerticalScrollIndicator={false}
						contentContainerStyle={{
							paddingBottom:
								insets.bottom + bottomTabBarHeight + floatingPlayerInset,
						}}
					/>
					{showIndexBar && (
						<AlphabetIndexBar
							letters={letters}
							currentIndex={currentSectionIdx}
							onSelect={handleSelectLetter}
							insetTop={8}
							insetBottom={
								insets.bottom + bottomTabBarHeight + floatingPlayerInset
							}
						/>
					)}
				</Box>
			)}
		</Box>
	);
}
