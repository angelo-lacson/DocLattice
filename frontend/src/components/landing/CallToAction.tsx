import React from "react";
import styled, { keyframes } from "styled-components";
import { motion } from "framer-motion";
import { Rocket, ArrowRight, Shield, Zap, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { color } from "../../theme/colors";
import { useEnv } from "../hooks/UseEnv";

interface CallToActionProps {
  isAuthenticated?: boolean;
}

const pulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.1); opacity: 0.3; }
`;

const Section = styled.section`
  position: relative;
  padding: 5rem 2rem;
  background: linear-gradient(135deg, ${color.B7} 0%, ${color.P7} 100%);
  overflow: hidden;

  @media (max-width: 768px) {
    padding: 4rem 1.5rem;
  }
`;

const BackgroundGlow = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 600px;
  height: 600px;
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.1) 0%,
    transparent 70%
  );
  animation: ${pulse} 4s ease-in-out infinite;
  pointer-events: none;
`;

const Container = styled.div`
  position: relative;
  max-width: 900px;
  margin: 0 auto;
  text-align: center;
  z-index: 1;
`;

const IconWrapper = styled(motion.div)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: 24px;
  margin-bottom: 2rem;
  color: white;
`;

const Title = styled(motion.h2)`
  font-size: 2.5rem;
  font-weight: 800;
  color: white;
  margin: 0 0 1rem 0;
  letter-spacing: -0.02em;

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const Subtitle = styled(motion.p)`
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.85);
  margin: 0 0 2.5rem 0;
  line-height: 1.7;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;

  @media (max-width: 768px) {
    font-size: 1.1rem;
  }
`;

const ButtonGroup = styled(motion.div)`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 3rem;
`;

const PrimaryButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 2rem;
  background: white;
  color: ${color.B7};
  border: none;
  border-radius: 14px;
  font-size: 1.0625rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);

  &:hover {
    transform: translateY(-3px) scale(1.02);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  }

  &:active {
    transform: translateY(-1px);
  }
`;

const SecondaryButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 2rem;
  background: transparent;
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-radius: 14px;
  font-size: 1.0625rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.6);
    transform: translateY(-2px);
  }
`;

const Features = styled(motion.div)`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  flex-wrap: wrap;
`;

const Feature = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.9375rem;
  font-weight: 500;

  svg {
    color: rgba(255, 255, 255, 0.6);
  }
`;

export const CallToAction: React.FC<CallToActionProps> = ({
  isAuthenticated,
}) => {
  const navigate = useNavigate();
  const { REACT_APP_USE_AUTH0 } = useEnv();
  const { loginWithRedirect } = useAuth0();

  const handleGetStarted = () => {
    if (REACT_APP_USE_AUTH0) {
      loginWithRedirect();
    } else {
      navigate("/login");
    }
  };

  const handleLearnMore = () => {
    // Scroll to collections section or navigate to about page
    navigate("/corpuses");
  };

  // Don't show CTA for authenticated users
  if (isAuthenticated) {
    return null;
  }

  return (
    <Section>
      <BackgroundGlow />
      <Container>
        <IconWrapper
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Rocket size={36} />
        </IconWrapper>

        <Title
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Ready to dive in?
        </Title>

        <Subtitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Join thousands of researchers, legal professionals, and analysts who
          are using OpenContracts to discover insights and collaborate on
          documents.
        </Subtitle>

        <ButtonGroup
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <PrimaryButton onClick={handleGetStarted}>
            Get Started Free
            <ArrowRight size={20} />
          </PrimaryButton>
          <SecondaryButton onClick={handleLearnMore}>
            Browse Collections
          </SecondaryButton>
        </ButtonGroup>

        <Features
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Feature>
            <Shield size={18} />
            Open Source & Free
          </Feature>
          <Feature>
            <Zap size={18} />
            AI-Powered Analysis
          </Feature>
          <Feature>
            <Users size={18} />
            Community Driven
          </Feature>
        </Features>
      </Container>
    </Section>
  );
};
