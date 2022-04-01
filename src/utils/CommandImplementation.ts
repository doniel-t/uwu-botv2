export class CommandImplementation{
    content : string;
    ephermeral : boolean;
    commandFunction : Function;
    
    constructor(content : string, ephermeral : boolean, commandFunction : Function){
        this.content = content;
        this.ephermeral = ephermeral;
        this.commandFunction = commandFunction;
    }
}