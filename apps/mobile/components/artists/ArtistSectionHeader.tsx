import { memo } from "react";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";

interface ArtistSectionHeaderProps {
  letter: string;
}

function ArtistSectionHeader({ letter }: ArtistSectionHeaderProps) {
  return (
    <Box className="px-6 pt-6 pb-2 bg-black">
      <Heading className="text-white uppercase" size="lg">
        {letter}
      </Heading>
    </Box>
  );
}

export default memo(ArtistSectionHeader);
