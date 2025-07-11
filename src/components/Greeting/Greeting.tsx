import React from 'react';

interface GreetingProps {
  name: string;
}

export const Greeting: React.FC<GreetingProps> = ({ name }) => {
  return <h1>Hello, {name}!</h1>;
};
