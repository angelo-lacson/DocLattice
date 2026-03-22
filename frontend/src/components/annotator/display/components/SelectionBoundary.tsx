import React, { useEffect, useRef } from "react";
import styled, { css } from "styled-components";
import { BoundingBox } from "../../../types";
import { hexToRgb } from "../../../../utils/transform";
import { pulseGreen, pulseMaroon } from "../effects";
import { useAnnotationRefs } from "../../hooks/useAnnotationRefs";
import { useAtomValue } from "jotai";
import { isCreatingAnnotationAtom } from "../../context/UISettingsAtom";

interface SelectionBoundaryProps {
  id: string;
  hidden: boolean;
  showBoundingBox?: boolean;
  scrollIntoView?: boolean;
  color: string;
  bounds: BoundingBox;
  selected: boolean;
  children?: React.ReactNode;
  annotationId?: string;
  onHover?: (hovered: boolean) => void;
  onClick?: () => void;
  approved?: boolean;
  rejected?: boolean;
}

const BoundarySpan = styled.span.attrs<{
  $width: number;
  $height: number;
  $rotateX: number;
  $rotateY: number;
  $bounds: BoundingBox;
  $backgroundColor: string;
  $boxShadow: string;
  $color: string;
  $hidden: boolean;
  $showBoundingBox: boolean;
  $approved?: boolean;
  $rejected?: boolean;
}>((props) => ({
  style: {
    position: "absolute",
    left: `${props.$bounds.left}px`,
    top: `${props.$bounds.top}px`,
    width: `${Math.abs(props.$width)}px`,
    height: `${Math.abs(props.$height)}px`,
    transform: `rotateY(${props.$rotateY}deg) rotateX(${props.$rotateX}deg)`,
    backgroundColor: props.$backgroundColor,
    zIndex: 2,
    border: "none",
    boxShadow: props.$boxShadow,
    transformOrigin: "top left",
    transition:
      "background-color 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease",
  },
}))`
  border-radius: 4px;

  ${(props) =>
    props.$approved &&
    css`
      box-shadow: inset 0 0 0 1.5px rgba(46, 204, 113, 0.5),
        0 0 8px 1px rgba(46, 204, 113, 0.25) !important;
      animation: ${pulseGreen} 2s infinite;
    `}

  ${(props) =>
    props.$rejected &&
    css`
      box-shadow: inset 0 0 0 1.5px rgba(128, 0, 0, 0.5),
        0 0 8px 1px rgba(128, 0, 0, 0.25) !important;
      animation: ${pulseMaroon} 2s infinite;
    `}
`;

export const SelectionBoundary: React.FC<SelectionBoundaryProps> = ({
  id,
  hidden,
  showBoundingBox = false,
  scrollIntoView = false,
  color,
  bounds,
  children,
  onHover,
  onClick,
  selected,
  approved,
  rejected,
}) => {
  const { registerRef, unregisterRef } = useAnnotationRefs();
  const boundaryRef = useRef<HTMLSpanElement | null>(null);
  const isCreatingAnnotation = useAtomValue(isCreatingAnnotationAtom);

  useEffect(() => {
    if (id) {
      registerRef("annotation", boundaryRef, id);
      return () => {
        unregisterRef("annotation", id);
      };
    }
  }, [id, registerRef, unregisterRef]);

  useEffect(() => {
    if (scrollIntoView && boundaryRef.current) {
      boundaryRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [scrollIntoView]);

  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const rotateY = width < 0 ? -180 : 0;
  const rotateX = height < 0 ? -180 : 0;
  const rgbColor = hexToRgb(color);
  const opacity = !showBoundingBox || hidden ? 0 : selected ? 0.4 : 0.1;
  const backgroundColor = `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, ${opacity})`;

  // Soft box-shadow replaces the old hard solid border.
  // An inset shadow gives a gentle inner edge, while a faint outer glow
  // lets the annotation "breathe" into the surrounding page.
  const boxShadow =
    showBoundingBox && !hidden
      ? selected
        ? `inset 0 0 0 1.5px rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, 0.55), 0 0 10px 1px rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, 0.2)`
        : `inset 0 0 0 1px rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, 0.35), 0 0 6px 0px rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, 0.1)`
      : "none";

  const handleClick = (e: React.MouseEvent) => {
    if (isCreatingAnnotation) return;
    if (e.shiftKey && onClick) {
      e.stopPropagation();
      onClick();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isCreatingAnnotation) return;
    if (e.shiftKey && onClick) {
      e.stopPropagation();
    }
  };

  return (
    <BoundarySpan
      id={`SELECTION_${id}`}
      ref={boundaryRef}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseEnter={
        onHover && !hidden && !isCreatingAnnotation
          ? () => onHover(true)
          : undefined
      }
      onMouseLeave={
        onHover && !hidden && !isCreatingAnnotation
          ? () => onHover(false)
          : undefined
      }
      $width={width}
      $height={height}
      $rotateX={rotateX}
      $rotateY={rotateY}
      $showBoundingBox={showBoundingBox}
      $hidden={hidden}
      $boxShadow={boxShadow}
      $color={color}
      $backgroundColor={backgroundColor}
      $bounds={bounds}
      $approved={approved}
      $rejected={rejected}
      style={{ pointerEvents: isCreatingAnnotation ? "none" : "auto" }}
    >
      {children || null}
    </BoundarySpan>
  );
};
