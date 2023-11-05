# Conversation

A module for using Mermaid.js flowcharts to outline and navigate a conversation.

## Definitions

**Conversation**
: A collection of potential steps for an end user that's directed by the end user's actions and/or response.

**Step**
: A single set of information and/or questions for an end user that may or may not be required for the conversation.

## Installation

### NPM

`npm install @jefko/conversation`

### Yarn

`yarn install @jefko/conversation`

## Getting Started

1. Create a Mermaid flowchart

   ```mermaid
   flowchart LR
     start([Start]) --continue--> collection[Collect Info]
     collection --validate/submit--> END([End])
   ```

2. Ensure each step has a `module` property for handling the step
   `step[|module:./step.mjs|]`

3. Create a conversation instance, handle the navigation events, trigger navigation, etc.

   ```javascript
   import conversation from '@jefko/conversation';

   const convo = conversation({ src: '[path to mermaid UML file]' });

   // Add an event listener
   const listener = (action, step) => {
     if (action === 'done') {
       // The conversation is complete, do whatever is next.
       // step should be undefined
       return;
     }

     if (action === 'continue') {
       // We're continuing the conversation
       // The step may be the same as previous if the step's module returns false for isComplete().
     }

     if (action === 'back') {
       // We're navigating to the previous step
       if (step === undefined) {
         // There's no previous step
       }
     }
   };
   convo.subscribe(listener);

   // Check if the conversation is ready
   const readyToStart = await convo.isReady();

   // Continue to the next step
   const next = await convo.continue();

   // Continue to a specific step
   const specific = await convo.continue('[step ID]');

   // Navigate back to the previous step
   const previous = await convo.back();

   // Render the step
   const output = await convo.render();

   // Remove the listener
   convo.unsubscribe(listener);
   ```
