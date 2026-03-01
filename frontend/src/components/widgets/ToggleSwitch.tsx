import styled from "styled-components";

export const ToggleSwitch = styled.label`
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  transform: scale(1.1);

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #e2e8f0;
    border-radius: 20px;
    transition: 0.2s;

    &:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      border-radius: 50%;
      transition: 0.2s;
    }
  }

  input:checked + span {
    background-color: #3b82f6;
  }

  input:checked + span:before {
    transform: translateX(16px);
  }
`;
