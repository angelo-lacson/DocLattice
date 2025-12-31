import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import {
  Hero,
  HeroTitle,
  HeroSubtitle,
  SearchBox,
} from "@opencontracts/ui/src";

interface NewHeroSectionProps {
  isAuthenticated?: boolean;
}

const HeroContainer = styled.div`
  background: linear-gradient(135deg, #f8f9fa 0%, #e8eef2 50%, #f0f4f8 100%);
  padding: 4rem 2rem;
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;

  @media (max-width: 768px) {
    padding: 3rem 1.5rem;
    min-height: 50vh;
  }
`;

const ContentWrapper = styled.div`
  max-width: 800px;
  width: 100%;
`;

const SearchWrapper = styled.div`
  margin-top: 2rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
`;

export const NewHeroSection: React.FC<NewHeroSectionProps> = ({
  isAuthenticated,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  const handleSearchSubmit = useCallback(
    (value: string) => {
      if (value.trim()) {
        navigate(`/discussions?search=${encodeURIComponent(value.trim())}`);
      }
    },
    [navigate]
  );

  return (
    <HeroContainer>
      <ContentWrapper>
        <Hero variant="centered" size="lg" showDecorations={true}>
          <HeroTitle>The open platform for legal knowledge</HeroTitle>
          <HeroSubtitle>
            {isAuthenticated
              ? "Welcome back! Explore trending collections, join discussions, and discover insights from the community."
              : "Join a community of researchers, legal professionals, and analysts. Explore public document collections and start meaningful conversations."}
          </HeroSubtitle>
          <SearchWrapper>
            <SearchBox
              placeholder="Search discussions, documents, collections..."
              value={searchQuery}
              onChange={handleSearchChange}
              onSubmit={handleSearchSubmit}
              size="lg"
              buttonText="Search"
            />
          </SearchWrapper>
        </Hero>
      </ContentWrapper>
    </HeroContainer>
  );
};
