import React, { useState, useCallback } from "react";
import styled, { keyframes } from "styled-components";
import { motion } from "framer-motion";
import { Search, Sparkles, FileText, Users, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { color } from "../../theme/colors";

// Keyframe animations
const float = keyframes`
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-20px) rotate(5deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.05); }
`;

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

// Styled components
const HeroContainer = styled.section`
  position: relative;
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  overflow: hidden;
  background: linear-gradient(
    135deg,
    ${color.B1} 0%,
    ${color.P1} 25%,
    ${color.N1} 50%,
    ${color.T1} 75%,
    ${color.G1} 100%
  );
  background-size: 400% 400%;
  animation: ${shimmer} 15s ease infinite;

  @media (max-width: 768px) {
    min-height: 60vh;
    padding: 3rem 1.5rem;
  }
`;

const BackgroundOrb = styled.div<{
  $size: number;
  $top: string;
  $left: string;
  $color: string;
  $delay: number;
}>`
  position: absolute;
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;
  top: ${(props) => props.$top};
  left: ${(props) => props.$left};
  border-radius: 50%;
  background: ${(props) => props.$color};
  filter: blur(60px);
  opacity: 0.3;
  animation: ${pulse} ${(props) => 4 + props.$delay}s ease-in-out infinite;
  animation-delay: ${(props) => props.$delay}s;
  pointer-events: none;
`;

const FloatingIcon = styled(motion.div)<{
  $top: string;
  $left: string;
  $delay: number;
}>`
  position: absolute;
  top: ${(props) => props.$top};
  left: ${(props) => props.$left};
  color: ${color.B5};
  opacity: 0.15;
  animation: ${float} ${(props) => 6 + props.$delay}s ease-in-out infinite;
  animation-delay: ${(props) => props.$delay}s;
  pointer-events: none;

  @media (max-width: 768px) {
    display: none;
  }
`;

const ContentWrapper = styled.div`
  position: relative;
  z-index: 10;
  max-width: 900px;
  text-align: center;
`;

const Badge = styled(motion.div)`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid ${color.N4};
  border-radius: 100px;
  font-size: 0.875rem;
  font-weight: 500;
  color: ${color.N8};
  margin-bottom: 1.5rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);

  svg {
    color: ${color.O6};
  }
`;

const Title = styled(motion.h1)`
  font-size: 4rem;
  font-weight: 800;
  line-height: 1.1;
  margin: 0 0 1.5rem 0;
  letter-spacing: -0.03em;
  background: linear-gradient(
    135deg,
    ${color.N10} 0%,
    ${color.B7} 50%,
    ${color.P7} 100%
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }

  @media (max-width: 480px) {
    font-size: 2rem;
  }
`;

const Subtitle = styled(motion.p)`
  font-size: 1.25rem;
  line-height: 1.7;
  color: ${color.N7};
  margin: 0 0 2.5rem 0;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;

  @media (max-width: 768px) {
    font-size: 1.1rem;
  }
`;

const SearchContainer = styled(motion.div)`
  position: relative;
  max-width: 600px;
  margin: 0 auto 2rem auto;
  width: 100%;
`;

const SearchInputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border: 2px solid ${color.N4};
  border-radius: 16px;
  padding: 0.5rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
  transition: all 0.3s ease;

  &:focus-within {
    border-color: ${color.B5};
    box-shadow: 0 8px 30px rgba(35, 118, 229, 0.15),
      0 0 0 4px rgba(35, 118, 229, 0.1);
  }
`;

const SearchIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  color: ${color.N6};
`;

const SearchInput = styled.input`
  flex: 1;
  border: none;
  background: transparent;
  font-size: 1.125rem;
  color: ${color.N10};
  outline: none;
  padding: 0.75rem 0;

  &::placeholder {
    color: ${color.N6};
  }
`;

const SearchButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.875rem 1.5rem;
  background: linear-gradient(135deg, ${color.B5} 0%, ${color.B6} 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: linear-gradient(135deg, ${color.B6} 0%, ${color.B7} 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(35, 118, 229, 0.3);
  }

  &:active {
    transform: translateY(0);
  }

  @media (max-width: 480px) {
    padding: 0.875rem 1rem;

    span {
      display: none;
    }
  }
`;

const QuickLinks = styled(motion.div)`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
`;

const QuickLink = styled.button`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid ${color.N4};
  border-radius: 100px;
  font-size: 0.875rem;
  color: ${color.N8};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: white;
    border-color: ${color.B4};
    color: ${color.B6};
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

interface HeroSectionProps {
  isAuthenticated?: boolean;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  isAuthenticated,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (searchQuery.trim()) {
        // Redirect to discussions with search query
        navigate(
          `/discussions?search=${encodeURIComponent(searchQuery.trim())}`
        );
      }
    },
    [searchQuery, navigate]
  );

  const handleQuickLink = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate]
  );

  return (
    <HeroContainer>
      {/* Background decorations */}
      <BackgroundOrb
        $size={400}
        $top="10%"
        $left="5%"
        $color={color.B3}
        $delay={0}
      />
      <BackgroundOrb
        $size={300}
        $top="60%"
        $left="80%"
        $color={color.P3}
        $delay={1}
      />
      <BackgroundOrb
        $size={350}
        $top="70%"
        $left="20%"
        $color={color.T3}
        $delay={2}
      />

      {/* Floating icons */}
      <FloatingIcon $top="15%" $left="10%" $delay={0}>
        <FileText size={48} />
      </FloatingIcon>
      <FloatingIcon $top="25%" $left="85%" $delay={1}>
        <Users size={40} />
      </FloatingIcon>
      <FloatingIcon $top="70%" $left="8%" $delay={2}>
        <MessageSquare size={36} />
      </FloatingIcon>
      <FloatingIcon $top="65%" $left="88%" $delay={0.5}>
        <FileText size={32} />
      </FloatingIcon>

      <ContentWrapper>
        <Badge
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Sparkles size={16} />
          Open Source Document Analytics Platform
        </Badge>

        <Title
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          Discover, Analyze &<br />
          Collaborate on Documents
        </Title>

        <Subtitle
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {isAuthenticated
            ? "Welcome back! Explore trending collections, join discussions, and discover insights from the community."
            : "Join a community of researchers, legal professionals, and analysts. Explore public document collections and start meaningful conversations."}
        </Subtitle>

        <SearchContainer
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <form onSubmit={handleSearch}>
            <SearchInputWrapper>
              <SearchIcon>
                <Search size={22} />
              </SearchIcon>
              <SearchInput
                type="text"
                placeholder="Search discussions, documents, collections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <SearchButton type="submit">
                <Search size={18} />
                <span>Search</span>
              </SearchButton>
            </SearchInputWrapper>
          </form>
        </SearchContainer>

        <QuickLinks
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <QuickLink onClick={() => handleQuickLink("/corpuses")}>
            <FileText />
            Browse Collections
          </QuickLink>
          <QuickLink onClick={() => handleQuickLink("/discussions")}>
            <MessageSquare />
            All Discussions
          </QuickLink>
          <QuickLink onClick={() => handleQuickLink("/leaderboard")}>
            <Users />
            Top Contributors
          </QuickLink>
        </QuickLinks>
      </ContentWrapper>
    </HeroContainer>
  );
};
