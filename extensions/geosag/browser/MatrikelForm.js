/*
 * @author     René Giovanni Borella
 * @copyright  2020 Geopartner A/S
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

import React from "react";
import FilledInput from "@material-ui/core/FilledInput";
import FormControl from "@material-ui/core/FormControl";
import FormHelperText from "@material-ui/core/FormHelperText";
import Input from "@material-ui/core/Input";
import InputLabel from "@material-ui/core/InputLabel";
import OutlinedInput from "@material-ui/core/OutlinedInput";
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';

class MatrikelForm extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      matrikelnummer: "",
      ejerlavskode: "",
      kommunekode: "",
      bfe: "",
      esr: "",
    };
  }

  handleChange = (event) => {
    //console.log(event.target.id)
    //console.log(event.target.value)
    this.setState({[event.target.id]:event.target.value});
  }

  handleSave = () => {
    console.log(this.state)

    //then
    this.handleClear();
  }

  handleClear = () => {
    this.setState({
      matrikelnummer: "",
      ejerlavskode: "",
      kommunekode: "",
      bfe: "",
      esr: "",
    })
  }

  render() {
    return (
      <div>
        <form noValidate autoComplete="off">
          <TextField id="matrikelnummer" onChange={this.handleChange.bind(this)} value={this.state.matrikelnummer} label="Matrikelnummer" color="primary" />
          <TextField id="ejerlavskode" onChange={this.handleChange.bind(this)} value={this.state.ejerlavskode} label="Ejerlavskode" color="primary" />
          <TextField id="kommunekode" onChange={this.handleChange.bind(this)} value={this.state.kommunekode} label="Kommunekode" color="primary" />
          <TextField id="bfe" onChange={this.handleChange.bind(this)} value={this.state.bfe} label="BFE-nummer" color="primary" />
          <TextField id="esr" onChange={this.handleChange.bind(this)} value={this.state.esr} label="ESR-nummer" color="primary" />
        </form>
        <Button onClick={this.handleSave}>Gem</Button>
        <Button color="secondary" onClick={this.handleClear}>Ryd</Button>
      </div>
    );
  }
}

module.exports = MatrikelForm;
