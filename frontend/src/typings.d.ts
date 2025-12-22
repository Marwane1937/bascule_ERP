declare const Quill: any;
declare module 'quill-mention';

// Extend jQuery interface to include Bootstrap modal methods
interface JQuery {
  modal(action?: 'show' | 'hide' | 'toggle' | 'handleUpdate'): JQuery;
}